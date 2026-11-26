import { Types } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RentalOrder, SystemSetting, Toy, User } from '../../src/models/index.js';
import { recordTrustBlock } from '../../src/services/trust-review.service.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
} from '../helpers/rental-fixtures.js';
import { useTestDatabase } from '../support/test-database.js';

useTestDatabase();

// BF-02 2a, UC06 step 4.1, UC29 (FE-09): a booking refused for a low Trust Score puts the Renter
// on the Admin's review list; an Admin lift lets the same booking through.

const DAY_MS = 86_400_000;
const TODAY_VN = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const day = (offset: number) =>
  new Date(Date.parse(`${TODAY_VN}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
const MSG28 = 'Điểm tin cậy của bạn quá thấp để thuê đồ chơi này.';

let app: ReturnType<typeof buildRentalApp>['app'];
let clock: FakeClock;
let ownerId: string;
let highToyId: string;
let otherHighToyId: string;
let lowToyId: string;

const dates = () => ({ startDate: day(4), endDate: day(6) });
const book = (userId: string, toyId: string, period = dates()) =>
  request(app).post('/api/v1/rentals').set(authHeader(userId)).send({ toyId, ...period });
const quote = (userId: string, toyId: string, period = dates()) =>
  request(app).post('/api/v1/rentals/quote').set(authHeader(userId)).send({ toyId, ...period });
const trustOf = async (userId: string) => (await User.findById(userId).lean())?.trust;
const renter = async (trust: Record<string, unknown>) =>
  String((await createUser({ trust }))._id);

beforeEach(async () => {
  await Promise.all([
    User.collection.deleteMany({}),
    Toy.collection.deleteMany({}),
    RentalOrder.collection.deleteMany({}),
    SystemSetting.collection.deleteMany({}),
  ]);
  clock = new FakeClock(`${day(0)}T03:00:00Z`);
  app = buildRentalApp(clock).app;
  ownerId = String((await createUser())._id);
  highToyId = String((await createRentToy(ownerId, { depositPrice: 600_000, title: 'Xe cọc cao' }))._id);
  otherHighToyId = String((await createRentToy(ownerId, { depositPrice: 900_000, title: 'Lego cọc cao' }))._id);
  lowToyId = String((await createRentToy(ownerId, { depositPrice: 200_000 }))._id);
});

describe('blocked Renters go to the Admin (UC29, FE-09)', () => {
  it('records the first refused booking with the toy, the score and the settings', async () => {
    const renterId = await renter({ score: 35 });
    const res = await book(renterId, highToyId);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'RENTER_RESTRICTED', message: MSG28 });

    const review = (await trustOf(renterId))?.review;
    expect(review).toMatchObject({
      attemptCount: 1,
      depositPrice: 600_000,
      score: 35,
      threshold: 50,
      depositLimit: 500_000,
    });
    expect(String(review?.toyId)).toBe(highToyId);
    expect(review?.requestedAt?.toISOString()).toBe(`${day(0)}T03:00:00.000Z`);
    expect(review?.lastBlockedAt?.toISOString()).toBe(`${day(0)}T03:00:00.000Z`);
    expect(await RentalOrder.countDocuments()).toBe(0);
  });

  it('keeps one review per user: repeats of the same toy within 30 minutes count once', async () => {
    const renterId = await renter({ score: 35 });
    expect((await quote(renterId, highToyId)).status).toBe(403);
    clock.advanceHours(0.25);
    // The booking card quotes again with other dates, then the Renter sends it.
    expect((await quote(renterId, highToyId, { startDate: day(5), endDate: day(8) })).status).toBe(403);
    expect((await book(renterId, highToyId)).status).toBe(403);
    let review = (await trustOf(renterId))?.review;
    expect(review?.attemptCount).toBe(1);
    expect(review?.lastBlockedAt?.toISOString()).toBe(`${day(0)}T03:15:00.000Z`);

    // 31 minutes after the last refusal: a new attempt.
    clock.advanceHours(31 / 60);
    expect((await book(renterId, highToyId)).status).toBe(403);
    // Another toy: a new attempt, and the latest toy is kept.
    expect((await book(renterId, otherHighToyId)).status).toBe(403);
    review = (await trustOf(renterId))?.review;
    expect(review?.attemptCount).toBe(3);
    expect(String(review?.toyId)).toBe(otherHighToyId);
    expect(review?.depositPrice).toBe(900_000);
    expect(review?.requestedAt?.toISOString()).toBe(`${day(0)}T03:00:00.000Z`);
    expect(await User.countDocuments({ 'trust.review.requestedAt': { $exists: true } })).toBe(1);
  });

  it('does not record anything for an allowed booking', async () => {
    const low = await renter({ score: 35 });
    expect((await book(low, lowToyId)).status).toBe(201);
    const border = await renter({ score: 50 });
    expect((await book(border, highToyId)).status).toBe(201);
    const unscored = String((await createUser({ trust: {} }))._id);
    expect((await book(unscored, otherHighToyId)).status).toBe(201);
    expect(await User.countDocuments({ 'trust.review': { $exists: true } })).toBe(0);
  });

  it('records the threshold and the deposit limit saved by the Admin', async () => {
    await SystemSetting.create([
      { key: 'rental.minTrustScore', value: '70' },
      { key: 'rental.trustDepositLimit', value: '100000' },
    ]);
    const renterId = await renter({ score: 60 });
    expect((await book(renterId, lowToyId)).status).toBe(403);
    expect((await trustOf(renterId))?.review).toMatchObject({
      score: 60,
      threshold: 70,
      depositLimit: 100_000,
      depositPrice: 200_000,
    });
  });
});

describe('the booking check honours the Admin decision', () => {
  const liftAt = (score: number) => ({
    liftedAt: new Date(),
    liftedBy: new Types.ObjectId(),
    reason: 'Đã xác minh người thuê qua điện thoại.',
    score,
  });

  it('lets a lifted Renter book while the score is not lower than at the lift', async () => {
    const same = await renter({ score: 40, lift: liftAt(40) });
    expect((await book(same, highToyId)).status).toBe(201);
    const better = await renter({ score: 45, lift: liftAt(40) });
    expect((await quote(better, otherHighToyId)).status).toBe(200);
    expect(await User.countDocuments({ 'trust.review': { $exists: true } })).toBe(0);
  });

  it('ends the lift when the score drops and opens a new review', async () => {
    const worse = await renter({ score: 38, lift: liftAt(40) });
    const res = await book(worse, highToyId);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(MSG28);
    const trust = await trustOf(worse);
    expect(trust?.lift).toBeUndefined();
    expect(trust?.review?.attemptCount).toBe(1);
  });

  it('after "keep" opens a new review only once the score has changed', async () => {
    const decision = { action: 'keep', reason: 'Giữ chặn.', decidedAt: new Date(), score: 40 };
    const kept = await renter({ score: 40, decision });
    expect((await book(kept, highToyId)).status).toBe(403);
    expect((await trustOf(kept))?.review).toBeUndefined();

    await User.updateOne({ _id: kept }, { $set: { 'trust.score': 37 } });
    expect((await book(kept, highToyId)).status).toBe(403);
    expect((await trustOf(kept))?.review).toMatchObject({ attemptCount: 1, score: 37 });
  });

  it('after a lock decision a refused booking opens a new review', async () => {
    const decision = { action: 'lock', reason: 'Khóa 7 ngày.', decidedAt: new Date(), score: 40 };
    const unlocked = await renter({ score: 40, decision });
    expect((await book(unlocked, highToyId)).status).toBe(403);
    expect((await trustOf(unlocked))?.review?.attemptCount).toBe(1);
  });

  it('still refuses with MSG28 when recording the attempt fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const renterId = await renter({ score: 35 });
    // A broken user id makes the write fail.
    const recorded = await recordTrustBlock({
      userId: 'not-an-id',
      trust: { score: 35 },
      toy: { _id: new Types.ObjectId(highToyId), depositPrice: 600_000 },
      settings: { minTrustScore: 50, trustDepositLimit: 500_000 },
      now: new Date(),
    });
    expect(recorded).toBe(false);
    expect(spy).toHaveBeenCalled();
    expect((await book(renterId, highToyId)).body.error.message).toBe(MSG28);
  });
});

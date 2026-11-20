import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Toy, User } from '../src/models/index.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';
import { seedReceivedReviews } from './helpers/review-fixtures.js';

const NOW = '2026-11-19T03:00:00Z';
const DAY_MS = 86_400_000;

describe('Trust restriction at rental creation', () => {
  let app: any;
  let clock: FakeClock;
  let sent: any[];
  let ownerId: string;
  let adminId: string;
  let renterId: string;
  let renterAuth: any;

  const period = { startDate: '2026-11-23', endDate: '2026-11-25' };
  const create = (toyId: string) =>
    request(app).post('/api/v1/rentals').set(renterAuth).send({ toyId, ...period });
  const quote = (toyId: string) =>
    request(app).post('/api/v1/rentals/quote').set(renterAuth).send({ toyId, ...period });
  const adminNotices = () => sent.filter((n) => n.userId === adminId);
  const trustOf = async () => (await User.findById(renterId).lean())!.trust!;
  const toyWithDeposit = async (depositPrice: number) =>
    (await createRentToy(ownerId, { depositPrice }))._id.toString();

  beforeAll(async () => {
    await startReplSet();
  });
  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    clock = new FakeClock(NOW);
    const built = buildRentalApp(clock);
    app = built.app;
    sent = built.notifier.sent;

    ownerId = (await createUser())._id.toString();
    adminId = (await createUser({ role: 'ADMIN' }))._id.toString();
    const renter = await createUser({ fullName: 'Low Renter' });
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);
  });

  it('blocks low score with high deposit and queues once', async () => {
    await seedReceivedReviews(renterId, [1, 1, 1], clock.now());
    const toyId = await toyWithDeposit(600_000);

    const res = await create(toyId);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('RENTER_RESTRICTED');
    expect(res.body.error.message).toBe(
      'Điểm tin cậy chưa đủ để thuê món đồ có tiền cọc này. Yêu cầu đã được chuyển cho quản trị viên xem xét.',
    );
    expect(res.body.error.details).toEqual({
      score: 20,
      minTrustScore: 30,
      depositCap: 500000,
      queued: true,
    });

    const trust = await trustOf();
    const requestedAt = trust.review?.requestedAt;
    expect(requestedAt).toEqual(new Date(NOW));
    expect(trust.review?.lastBlocked?.depositAmount).toBe(600000);
    expect(trust.review?.lastBlocked?.toyId.toString()).toBe(toyId);
    expect(adminNotices()).toHaveLength(1);
    expect(adminNotices()[0]).toMatchObject({
      title: 'Có người dùng cần xem xét điểm tin cậy',
      body: 'Low Renter bị chặn đặt thuê món cọc 600000đ (điểm 20).',
    });

    clock.advanceHours(1);
    const again = await create(toyId);
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('RENTER_RESTRICTED');
    expect(again.body.error.message).toBe('Điểm tin cậy chưa đủ để thuê món đồ có tiền cọc này.');
    expect(again.body.error.details.queued).toBe(false);
    const after = await trustOf();
    expect(after.review?.requestedAt).toEqual(requestedAt);
    expect(after.review?.lastBlocked?.attemptAt).toEqual(clock.now());
    expect(adminNotices()).toHaveLength(1);
  });

  it('allows deposit equal to the cap', async () => {
    await seedReceivedReviews(renterId, [1, 1, 1], clock.now());
    expect((await create(await toyWithDeposit(500_000))).status).toBe(201);
  });

  it('allows toys without depositPrice', async () => {
    await seedReceivedReviews(renterId, [1, 1, 1], clock.now());
    const toyId = await toyWithDeposit(600_000);
    await Toy.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(toyId) },
      { $unset: { depositPrice: '' } },
    );
    expect((await create(toyId)).status).toBe(201);
  });

  it('does not block with fewer than 3 reviews', async () => {
    await seedReceivedReviews(renterId, [1, 1], clock.now());
    expect((await create(await toyWithDeposit(600_000))).status).toBe(201);
  });

  it('allows score at or above threshold', async () => {
    await seedReceivedReviews(renterId, [2, 2, 1], clock.now());
    expect((await create(await toyWithDeposit(600_000))).status).toBe(201);
    expect((await trustOf()).score).toBe(33);
  });

  it('allows score exactly at the threshold', async () => {
    await seedReceivedReviews(renterId, [2, 2, 1, 1], clock.now());
    expect((await create(await toyWithDeposit(600_000))).status).toBe(201);
    expect((await trustOf()).score).toBe(30);
  });

  it('quote reports but does not queue', async () => {
    await seedReceivedReviews(renterId, [1, 1, 1], clock.now());
    const res = await quote(await toyWithDeposit(600_000));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('RENTER_RESTRICTED');
    expect(res.body.error.message).toBe('Điểm tin cậy chưa đủ để thuê món đồ có tiền cọc này.');
    expect(res.body.error.details.queued).toBe(false);
    const trust = await trustOf();
    expect(trust.review?.requestedAt).toBeUndefined();
    expect(trust.review?.lastBlocked).toBeUndefined();
    expect(adminNotices()).toHaveLength(0);
  });

  it('override in force allows; expired override re-queues', async () => {
    await seedReceivedReviews(renterId, [1, 1, 1], clock.now());
    const toyId = await toyWithDeposit(600_000);
    await User.updateOne(
      { _id: renterId },
      { $set: { 'trust.override.allowedUntil': new Date(clock.now().getTime() + DAY_MS) } },
    );
    expect((await create(toyId)).status).toBe(201);

    clock.advanceHours(25);
    await User.updateOne(
      { _id: renterId },
      {
        $set: {
          'trust.lastDecision': {
            decision: 'ALLOW',
            reason: 'ok',
            scoreAtDecision: 20,
            decidedBy: new mongoose.Types.ObjectId(adminId),
            decidedAt: new Date(NOW),
          },
        },
      },
    );
    const res = await create(await toyWithDeposit(600_000));
    expect(res.status).toBe(403);
    expect((await trustOf()).review?.requestedAt).toEqual(clock.now());
    expect(adminNotices()).toHaveLength(1);
  });

  it('KEEP_RESTRICTED re-queues only when the score changed', async () => {
    await seedReceivedReviews(renterId, [1, 1, 1], clock.now());
    await User.updateOne(
      { _id: renterId },
      {
        $set: {
          'trust.lastDecision': {
            decision: 'KEEP_RESTRICTED',
            reason: 'no',
            scoreAtDecision: 20,
            decidedBy: new mongoose.Types.ObjectId(adminId),
            decidedAt: new Date(NOW),
          },
        },
      },
    );
    const toyId = await toyWithDeposit(600_000);

    const first = await create(toyId);
    expect(first.status).toBe(403);
    expect(first.body.error.message).toBe('Điểm tin cậy chưa đủ để thuê món đồ có tiền cọc này.');
    expect(first.body.error.details.queued).toBe(false);
    let trust = await trustOf();
    expect(trust.review?.requestedAt).toBeUndefined();
    expect(trust.review?.lastBlocked?.depositAmount).toBe(600000);
    expect(adminNotices()).toHaveLength(0);

    await seedReceivedReviews(renterId, [2], clock.now());
    const second = await create(toyId);
    expect(second.status).toBe(403);
    expect(second.body.error.details.score).toBe(25);
    expect(second.body.error.details.queued).toBe(true);
    trust = await trustOf();
    expect(trust.review?.requestedAt).toEqual(clock.now());
    expect(adminNotices()).toHaveLength(1);
  });

  it('recomputes before checking', async () => {
    await User.updateOne({ _id: renterId }, { $set: { 'trust.score': 90 } });
    await seedReceivedReviews(renterId, [1, 1, 1], clock.now());
    const res = await create(await toyWithDeposit(600_000));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('RENTER_RESTRICTED');
  });
});

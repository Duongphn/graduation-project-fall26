import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderStatusHistory, RentalOrder, SystemSetting } from '../src/models/index.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

// Dates are relative to the real today (Vietnam time): the public availability endpoint checks
// "from" against the real clock, so fixed dates fail once they are in the past.
const DAY_MS = 86_400_000;
const TODAY_VN = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const day = (offset: number) =>
  new Date(Date.parse(`${TODAY_VN}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
const CODE_DAY = TODAY_VN.slice(2).replaceAll('-', '');

describe('UC06: Quote and Create Rental Order', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let toyId: string;
  let ownerId: string;
  let renterId: string;
  let otherRenterId: string;
  let thirdRenterId: string;
  let renterAuth: any;
  let ownerAuth: any;
  let otherRenterAuth: any;
  let thirdRenterAuth: any;

  const create = (token: any, body: any) =>
    request(app).post('/api/v1/rentals').set(token).send(body);

  const unwrap = (res: request.Response) => res.body.data;
  const errorOf = (res: request.Response) => res.body.error;

  const body35 = () => ({ toyId, startDate: day(4), endDate: day(6) });

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    clock = new FakeClock(`${day(0)}T03:00:00Z`);
    const built = buildRentalApp(clock);
    app = built.app;
    notifier = built.notifier;

    const owner = await createUser();
    ownerId = owner._id.toString();
    ownerAuth = authHeader(ownerId);

    const renter = await createUser();
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);

    const otherRenter = await createUser();
    otherRenterId = otherRenter._id.toString();
    otherRenterAuth = authHeader(otherRenterId);

    const thirdRenter = await createUser();
    thirdRenterId = thirdRenter._id.toString();
    thirdRenterAuth = authHeader(thirdRenterId);

    const toy = await createRentToy(ownerId);
    toyId = toy._id.toString();
  });

  it('quotes without writing', async () => {
    const res = await request(app).post('/api/v1/rentals/quote').set(renterAuth).send(body35());
    expect(res.status).toBe(200);
    expect(unwrap(res)).toMatchObject({
      available: true,
      conflicts: [],
      pricing: { rentalFee: 150_000, platformFee: 15_000, totalPayable: 350_000 },
    });
    expect(await RentalOrder.countDocuments()).toBe(0);
  });

  it('creates a pending order holding the calendar', async () => {
    const res = await create(renterAuth, body35());
    expect(res.status).toBe(201);
    expect(unwrap(res)).toMatchObject({
      status: 'PENDING',
      period: { startDate: day(4), endDate: day(6) },
      timer: { kind: 'OWNER_RESPONSE', dueAt: `${day(1)}T03:00:00.000Z` },
    });
    expect(unwrap(res).code).toMatch(new RegExp(`^RO${CODE_DAY}`));
    expect(await OrderStatusHistory.countDocuments({ newStatus: 'PENDING' })).toBe(1);
    expect(notifier.sent.map((n: any) => n.userId)).toEqual([ownerId]);
    const avail = await request(app).get(`/api/v1/toys/${toyId}/availability?from=${day(0)}&to=${day(29)}`);
    expect(JSON.stringify(avail.body)).toContain(day(4));
  });

  it('blocks renting own listing, unverified users and low trust', async () => {
    expect(errorOf(await create(ownerAuth, body35())).code).toBe('CANNOT_RENT_OWN_LISTING');

    const unverifiedUser = await createUser({ verificationStatus: 'unverified' });
    const resUnverified = await create(authHeader(unverifiedUser._id.toString()), body35());
    expect(resUnverified.status).toBe(403);
    expect(errorOf(resUnverified).code).toBe('USER_NOT_VERIFIED');

  });

  // GB-29, UC07 4.1, MSG28: ngưỡng 50 và chỉ với đồ có tiền cọc trên mức Admin đặt (mặc định 500.000)
  it('blocks a low trust score only for toys whose deposit is above the limit', async () => {
    const highDepositToy = await createRentToy(ownerId, { depositPrice: 600_000 });
    const limitDepositToy = await createRentToy(ownerId, { depositPrice: 500_000 });
    const dates = { startDate: day(4), endDate: day(6) };
    const lowTrust = authHeader((await createUser({ trust: { score: 49 } }))._id.toString());

    const blocked = await create(lowTrust, { toyId: highDepositToy._id.toString(), ...dates });
    expect(blocked.status).toBe(403);
    expect(errorOf(blocked)).toMatchObject({
      code: 'RENTER_RESTRICTED',
      message: 'Điểm tin cậy của bạn quá thấp để thuê đồ chơi này.',
    });
    const quote = await request(app)
      .post('/api/v1/rentals/quote')
      .set(lowTrust)
      .send({ toyId: highDepositToy._id.toString(), ...dates });
    expect(errorOf(quote).code).toBe('RENTER_RESTRICTED');

    // Cọc 200.000 (đồ mặc định) và cọc đúng bằng mức giới hạn: vẫn thuê được dù điểm 49
    expect((await create(lowTrust, body35())).status).toBe(201);
    expect((await create(lowTrust, { toyId: limitDepositToy._id.toString(), ...dates })).status).toBe(201);
    // Điểm 20 vẫn thuê được đồ cọc thấp; điểm đúng 50 thuê được đồ cọc cao
    const veryLow = authHeader((await createUser({ trust: { score: 20 } }))._id.toString());
    expect(
      (await create(veryLow, { toyId: (await createRentToy(ownerId, { depositPrice: 100_000 }))._id.toString(), ...dates })).status,
    ).toBe(201);
    const border = authHeader((await createUser({ trust: { score: 50 } }))._id.toString());
    expect(
      (await create(border, { toyId: (await createRentToy(ownerId, { depositPrice: 600_000 }))._id.toString(), ...dates })).status,
    ).toBe(201);
  });

  it('reads the trust threshold and the deposit limit from the system settings', async () => {
    await SystemSetting.create([
      { key: 'rental.minTrustScore', value: '70' },
      { key: 'rental.trustDepositLimit', value: '100000' },
    ]);
    const renter60 = authHeader((await createUser({ trust: { score: 60 } }))._id.toString());
    const res = await create(renter60, body35());
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe('RENTER_RESTRICTED');
  });

  it('rejects inactive, sell and missing toys with 404 TOY_NOT_FOUND', async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const resMissing = await create(renterAuth, { toyId: missingId, startDate: day(4), endDate: day(6) });
    expect(resMissing.status).toBe(404);
    expect(errorOf(resMissing).code).toBe('TOY_NOT_FOUND');

    const sellToy = await createRentToy(ownerId, { listingType: 'sell' });
    const resSell = await create(renterAuth, { toyId: sellToy._id.toString(), startDate: day(4), endDate: day(6) });
    expect(resSell.status).toBe(404);
    expect(errorOf(resSell).code).toBe('TOY_NOT_FOUND');

    const hiddenToy = await createRentToy(ownerId, { status: 'hidden' });
    const resHidden = await create(renterAuth, { toyId: hiddenToy._id.toString(), startDate: day(4), endDate: day(6) });
    expect(resHidden.status).toBe(404);
    expect(errorOf(resHidden).code).toBe('TOY_NOT_FOUND');
  });

  it('rejects overlapping dates with conflicts and a suggestion', async () => {
    await create(renterAuth, body35());
    const res = await create(otherRenterAuth, { toyId, startDate: day(5), endDate: day(7) });
    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: 'RENTAL_DATES_UNAVAILABLE',
      details: {
        conflicts: [{ startDate: day(4), endDate: day(6) }],
        suggestion: { startDate: day(0), endDate: day(2) },
      },
    });
  });

  // Review Focus #3
  it('allows back-to-back bookings but not a shared day', async () => {
    await create(renterAuth, body35());
    expect((await create(otherRenterAuth, { toyId, startDate: day(7), endDate: day(8) })).status).toBe(201);
    expect((await create(thirdRenterAuth, { toyId, startDate: day(5), endDate: day(6) })).status).toBe(409);
  });

  it('lets exactly one of two concurrent overlapping requests win', async () => {
    const [a, b] = await Promise.all([create(renterAuth, body35()), create(otherRenterAuth, body35())]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await RentalOrder.countDocuments({ toyId })).toBe(1);
  });
});

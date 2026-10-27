import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderStatusHistory, RentalOrder } from '../src/models/index.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

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

  const body35 = () => ({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    clock = new FakeClock('2026-11-01T03:00:00Z');
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
      period: { startDate: '2026-11-05', endDate: '2026-11-07' },
      timer: { kind: 'OWNER_RESPONSE', dueAt: '2026-11-02T03:00:00.000Z' },
    });
    expect(unwrap(res).code).toMatch(/^RO261101/);
    expect(await OrderStatusHistory.countDocuments({ newStatus: 'PENDING' })).toBe(1);
    expect(notifier.sent.map((n: any) => n.userId)).toEqual([ownerId]);
    const avail = await request(app).get(`/api/v1/toys/${toyId}/availability?from=2026-11-01&to=2026-11-30`);
    expect(JSON.stringify(avail.body)).toContain('2026-11-05');
  });

  it('blocks renting own listing, unverified users and low trust', async () => {
    expect(errorOf(await create(ownerAuth, body35())).code).toBe('CANNOT_RENT_OWN_LISTING');

    const unverifiedUser = await createUser({ verificationStatus: 'unverified' });
    const resUnverified = await create(authHeader(unverifiedUser._id.toString()), body35());
    expect(resUnverified.status).toBe(403);
    expect(errorOf(resUnverified).code).toBe('USER_NOT_VERIFIED');

    const lowTrustUser = await createUser({ trust: { score: 29 } });
    const resLowTrust = await create(authHeader(lowTrustUser._id.toString()), body35());
    expect(resLowTrust.status).toBe(403);
    expect(errorOf(resLowTrust).code).toBe('RENTER_RESTRICTED');

    const borderTrustUser = await createUser({ trust: { score: 30 } });
    const resBorder = await create(authHeader(borderTrustUser._id.toString()), body35());
    expect(resBorder.status).toBe(201);
  });

  it('rejects inactive, sell and missing toys with 404 TOY_NOT_FOUND', async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const resMissing = await create(renterAuth, { toyId: missingId, startDate: '2026-11-05', endDate: '2026-11-07' });
    expect(resMissing.status).toBe(404);
    expect(errorOf(resMissing).code).toBe('TOY_NOT_FOUND');

    const sellToy = await createRentToy(ownerId, { listingType: 'sell' });
    const resSell = await create(renterAuth, { toyId: sellToy._id.toString(), startDate: '2026-11-05', endDate: '2026-11-07' });
    expect(resSell.status).toBe(404);
    expect(errorOf(resSell).code).toBe('TOY_NOT_FOUND');

    const hiddenToy = await createRentToy(ownerId, { status: 'hidden' });
    const resHidden = await create(renterAuth, { toyId: hiddenToy._id.toString(), startDate: '2026-11-05', endDate: '2026-11-07' });
    expect(resHidden.status).toBe(404);
    expect(errorOf(resHidden).code).toBe('TOY_NOT_FOUND');
  });

  it('rejects overlapping dates with conflicts and a suggestion', async () => {
    await create(renterAuth, body35());
    const res = await create(otherRenterAuth, { toyId, startDate: '2026-11-06', endDate: '2026-11-08' });
    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: 'RENTAL_DATES_UNAVAILABLE',
      details: {
        conflicts: [{ startDate: '2026-11-05', endDate: '2026-11-07' }],
        suggestion: { startDate: '2026-11-01', endDate: '2026-11-03' },
      },
    });
  });

  // Review Focus #3
  it('allows back-to-back bookings but not a shared day', async () => {
    await create(renterAuth, body35());
    expect((await create(otherRenterAuth, { toyId, startDate: '2026-11-08', endDate: '2026-11-09' })).status).toBe(201);
    expect((await create(thirdRenterAuth, { toyId, startDate: '2026-11-07', endDate: '2026-11-07' })).status).toBe(409);
  });

  it('lets exactly one of two concurrent overlapping requests win', async () => {
    const [a, b] = await Promise.all([create(renterAuth, body35()), create(otherRenterAuth, body35())]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await RentalOrder.countDocuments({ toyId })).toBe(1);
  });
});

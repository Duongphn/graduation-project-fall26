import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Dispute, RentalOrder, Wallet, WalletTransaction } from '../src/models/index.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
  fund,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const RECEIVED_AT = '2026-11-05T03:00:00Z';
const VALID_DESCRIPTION = 'Đồ chơi bị nứt phần thân, thiếu một bánh xe.';
const VALID_MESSAGE = 'Đồ chơi còn nguyên vẹn khi trả, có ảnh đối chiếu.';
const VALID_REASON = 'Ảnh lúc giao và lúc trả cho thấy vết nứt mới xuất hiện sau khi thuê.';

// R = 100_000 (2 days × 50_000), D = 200_000, F = 10_000, L = 0
describe('UC19: admin case file and verdict', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let ledger: any;
  let ownerId: string;
  let renterId: string;
  let adminId: string;
  let renterAuth: any;
  let ownerAuth: any;
  let adminAuth: any;
  let orderId: string;
  let orderCode: string;

  const unwrap = (res: request.Response) => res.body.data;
  const errorOf = (res: request.Response) => res.body.error;
  const service = () => (app as any).locals.container.disputeService;

  const sumBalances = async () => {
    const res = await Wallet.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]);
    return res[0]?.total ?? 0;
  };

  const balances = async () => ({
    owner: (await ledger.getOrCreateUserWallet(ownerId)).balance as number,
    renter: (await ledger.getOrCreateUserWallet(renterId)).balance as number,
    platform: (await ledger.getOrCreateSystemWallet('platform')).balance as number,
    escrow: (await ledger.getOrCreateSystemWallet('escrow')).balance as number,
  });

  const openDispute = async (auth: any, reason: string): Promise<string> => {
    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/disputes`)
      .set(auth)
      .field('reason', reason)
      .field('description', VALID_DESCRIPTION)
      .attach('photos', JPEG, 'evidence.jpg');
    expect(res.status).toBe(201);
    return unwrap(res).dispute.id;
  };

  const respond = async (auth: any, id: string) => {
    const res = await request(app)
      .post(`/api/v1/disputes/${id}/response`)
      .set(auth)
      .field('message', VALID_MESSAGE);
    expect(res.status).toBe(200);
  };

  const returnToy = async () => {
    clock.set('2026-11-06T10:00:00Z');
    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');
    expect(unwrap(res).status).toBe('RETURNING');
    clock.advanceHours(1);
  };

  /** Owner complains during the inspection, the renter answers: dispute under review. */
  const ownerDisputeUnderReview = async (): Promise<string> => {
    await returnToy();
    const id = await openDispute(ownerAuth, 'DAMAGED_ON_RETURN');
    await respond(renterAuth, id);
    return id;
  };

  const resolve = (id: string, body: Record<string, unknown>, auth = adminAuth) =>
    request(app).post(`/api/v1/admin/disputes/${id}/resolve`).set(auth).send(body);

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
    ledger = built.ledger;

    ownerId = (await createUser())._id.toString();
    ownerAuth = authHeader(ownerId);
    renterId = (await createUser())._id.toString();
    renterAuth = authHeader(renterId);
    adminId = (await createUser({ role: 'ADMIN' }))._id.toString();
    adminAuth = authHeader(adminId, 'ADMIN');

    const toy = await createRentToy(ownerId);
    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId: toy._id.toString(), startDate: '2026-11-05', endDate: '2026-11-06' });
    orderId = unwrap(created).id;
    orderCode = unwrap(created).code;
    expect(unwrap(created).pricing).toMatchObject({
      rentalFee: 100_000,
      depositAmount: 200_000,
      platformFee: 10_000,
    });
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    clock.set('2026-11-04T03:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');
    clock.set(RECEIVED_AT);
    await request(app)
      .post(`/api/v1/rentals/${orderId}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');
  });

  it('pays the owner from the deposit', async () => {
    const id = await ownerDisputeUnderReview();
    const before = await balances();
    const total = await sumBalances();
    notifier.sent.length = 0;

    const res = await resolve(id, {
      verdict: 'PARTIAL',
      compensation: 50_000,
      reason: VALID_REASON,
    });

    expect(res.status).toBe(200);
    const dispute = unwrap(res);
    expect(dispute.status).toBe('resolved');
    expect(dispute.resolution).toMatchObject({
      verdict: 'PARTIAL',
      compensation: 50_000,
      reason: VALID_REASON,
      payout: { owner: 140_000, renter: 150_000, platform: 10_000 },
    });

    const after = await balances();
    expect(after.owner - before.owner).toBe(140_000);
    expect(after.renter - before.renter).toBe(150_000);
    expect(after.platform - before.platform).toBe(10_000);
    expect(before.escrow - after.escrow).toBe(300_000);
    expect(after.escrow).toBe(0);
    expect(await sumBalances()).toBe(total);

    const order = await RentalOrder.findById(orderId);
    expect(order?.status).toBe('COMPLETED');
    const stored = await Dispute.findById(id);
    expect(stored?.resolvedBy?.toString()).toBe(adminId);

    const history = await request(app).get(`/api/v1/rentals/${orderId}/history`).set(ownerAuth);
    expect(
      unwrap(history).some((h: any) => h.oldStatus === 'DISPUTING' && h.newStatus === 'COMPLETED'),
    ).toBe(true);

    const toOwner = notifier.sent.find((n: any) => n.userId === ownerId);
    const toRenter = notifier.sent.find((n: any) => n.userId === renterId);
    expect(toOwner.body).toContain(orderCode);
    expect(toOwner.body).toContain('140.000');
    expect(toRenter.body).toContain(orderCode);
    expect(toRenter.body).toContain('150.000');
    expect(toRenter.body).not.toContain('10.000');
  });

  it('refunds the renter from the rental fee', async () => {
    clock.advanceHours(1);
    const id = await openDispute(renterAuth, 'DAMAGED_ON_RECEIPT');
    clock.advanceHours(72);
    notifier.sent.length = 0;
    expect(await service().expireResponses()).toEqual({ moved: 1 });
    for (const n of notifier.sent) {
      expect(n.body).toContain(orderCode);
    }
    const before = await balances();

    const res = await resolve(id, {
      verdict: 'CLAIMANT_FAVORED',
      compensation: 40_000,
      reason: VALID_REASON,
    });

    expect(res.status).toBe(200);
    const after = await balances();
    expect(after.renter - before.renter).toBe(240_000);
    expect(after.owner - before.owner).toBe(54_000);
    expect(after.platform - before.platform).toBe(6_000);
    expect(after.escrow).toBe(0);
    expect((await RentalOrder.findById(orderId))?.status).toBe('COMPLETED');
  });

  it('caps the compensation', async () => {
    const id = await ownerDisputeUnderReview();

    const res = await resolve(id, {
      verdict: 'CLAIMANT_FAVORED',
      compensation: 200_001,
      reason: VALID_REASON,
    });

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('COMPENSATION_TOO_HIGH');
    expect(errorOf(res).details.max).toBe(200_000);
    expect((await Dispute.findById(id))?.status).toBe('under_review');
  });

  it('settles with no compensation when the late fee eats the whole deposit', async () => {
    clock.set('2026-12-01T10:00:00Z');
    const returned = await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');
    expect(unwrap(returned).status).toBe('RETURNING');
    clock.advanceHours(1);
    const id = await openDispute(ownerAuth, 'DAMAGED_ON_RETURN');
    await respond(renterAuth, id);
    const total = await sumBalances();
    const txCount = await WalletTransaction.countDocuments();

    const tooHigh = await resolve(id, {
      verdict: 'CLAIMANT_FAVORED',
      compensation: 1,
      reason: VALID_REASON,
    });
    expect(tooHigh.status).toBe(400);
    expect(errorOf(tooHigh).code).toBe('COMPENSATION_TOO_HIGH');
    expect(errorOf(tooHigh).details.max).toBe(0);
    expect(await WalletTransaction.countDocuments()).toBe(txCount);

    const res = await resolve(id, {
      verdict: 'CLAIMANT_FAVORED',
      compensation: 0,
      reason: VALID_REASON,
    });
    expect(res.status).toBe(200);
    expect(unwrap(res).status).toBe('resolved');
    expect(await sumBalances()).toBe(total);
    const b = await balances();
    expect(Math.min(b.owner, b.renter, b.platform, b.escrow)).toBeGreaterThanOrEqual(0);
    expect(await WalletTransaction.countDocuments({ amount: { $lte: 0 } })).toBe(0);
  });

  it('does not let an Admin who is a party decide the dispute', async () => {
    const id = await ownerDisputeUnderReview();
    const before = await balances();

    const res = await resolve(
      id,
      { verdict: 'PARTIAL', compensation: 50_000, reason: VALID_REASON },
      authHeader(ownerId, 'ADMIN'),
    );

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
    expect((await Dispute.findById(id))?.status).toBe('under_review');
    expect(await balances()).toEqual(before);
  });

  it('checks the verdict against the amount', async () => {
    const id = await ownerDisputeUnderReview();

    const favored = await resolve(id, {
      verdict: 'RESPONDENT_FAVORED',
      compensation: 1,
      reason: VALID_REASON,
    });
    expect(favored.status).toBe(400);
    expect(errorOf(favored).code).toBe('VALIDATION_ERROR');

    const partial = await resolve(id, {
      verdict: 'PARTIAL',
      compensation: 0,
      reason: VALID_REASON,
    });
    expect(partial.status).toBe(400);
    expect(errorOf(partial).code).toBe('VALIDATION_ERROR');

    for (const compensation of [-1, 1.5, '1000']) {
      const bad = await resolve(id, { verdict: 'PARTIAL', compensation, reason: VALID_REASON });
      expect(bad.status).toBe(400);
      expect(errorOf(bad).code).toBe('VALIDATION_ERROR');
    }
    const verdict = await resolve(id, { verdict: 'NOPE', compensation: 1, reason: VALID_REASON });
    expect(verdict.status).toBe(400);
    expect((await Dispute.findById(id))?.status).toBe('under_review');
  });

  it('takes a reason of 30 to 500 characters', async () => {
    const id = await ownerDisputeUnderReview();

    for (const reason of ['x'.repeat(29), 'x'.repeat(501), `  ${'x'.repeat(29)}  `]) {
      const res = await resolve(id, { verdict: 'RESPONDENT_FAVORED', compensation: 0, reason });
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    }
    expect((await Dispute.findById(id))?.status).toBe('under_review');
  });

  it('never changes a verdict', async () => {
    const id = await ownerDisputeUnderReview();
    const body = { verdict: 'PARTIAL', compensation: 50_000, reason: VALID_REASON };

    const results = await Promise.all([resolve(id, body), resolve(id, body)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(errorOf(loser).code).toBe('DISPUTE_NOT_UNDER_REVIEW');
    // escrow, owner, platform, renter: one posting only
    expect(
      await WalletTransaction.countDocuments({ postingKey: `rental:${orderId}:dispute` }),
    ).toBe(4);

    const third = await resolve(id, { ...body, verdict: 'RESPONDENT_FAVORED', compensation: 0 });
    expect(third.status).toBe(409);
    expect(errorOf(third).code).toBe('DISPUTE_NOT_UNDER_REVIEW');
    expect((await Dispute.findById(id))?.resolution?.verdict).toBe('PARTIAL');
  });

  it('resolves only disputes under review', async () => {
    await returnToy();
    const id = await openDispute(ownerAuth, 'DAMAGED_ON_RETURN');

    const res = await resolve(id, {
      verdict: 'RESPONDENT_FAVORED',
      compensation: 0,
      reason: VALID_REASON,
    });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('DISPUTE_NOT_UNDER_REVIEW');
    expect(
      await WalletTransaction.countDocuments({ postingKey: `rental:${orderId}:dispute` }),
    ).toBe(0);
  });

  it('shows the case file to the Admin only', async () => {
    const id = await ownerDisputeUnderReview();

    const res = await request(app).get(`/api/v1/admin/disputes/${id}`).set(adminAuth);

    expect(res.status).toBe(200);
    const data = unwrap(res);
    expect(data.dispute.id).toBe(id);
    expect(data.claimant).toMatchObject({ id: ownerId, verified: true, trustScore: 80 });
    expect(data.respondent.id).toBe(renterId);
    expect(data.respondent.fullName).toBeDefined();
    expect(data.caseFile.order.id).toBe(orderId);
    expect(data.caseFile.order.handover.ownerPhotos).toHaveLength(1);
    expect(data.caseFile.order.returnInfo.photos).toHaveLength(1);
    expect(data.caseFile.history.length).toBeGreaterThan(0);
    expect(data.caseFile.amounts).toEqual({
      rentalFee: 100_000,
      depositAmount: 200_000,
      platformFee: 10_000,
      lateFee: 0,
    });
    expect(data.compensationCap).toBe(200_000);
    expect(data.conversation).toBeNull();
    expect(data.aiAssessment).toBeNull();

    const forbidden = await request(app).get(`/api/v1/admin/disputes/${id}`).set(ownerAuth);
    expect(forbidden.status).toBe(403);
    const forbiddenList = await request(app).get('/api/v1/admin/disputes').set(renterAuth);
    expect(forbiddenList.status).toBe(403);
    const missing = await request(app)
      .get('/api/v1/admin/disputes/0123456789abcdef01234567')
      .set(adminAuth);
    expect(missing.status).toBe(404);
    expect(errorOf(missing).code).toBe('DISPUTE_NOT_FOUND');
  });

  it('lists disputes under review by default', async () => {
    const id = await ownerDisputeUnderReview();
    // A second order whose dispute is still open
    await Dispute.create({
      code: 'DP-OPEN-1',
      orderType: 'rental_order',
      orderId: new mongoose.Types.ObjectId(),
      claimantId: ownerId,
      respondentId: renterId,
      claimantRole: 'owner',
      reason: 'OTHER',
      description: VALID_DESCRIPTION,
      status: 'open',
      openedAt: clock.now(),
    });

    const res = await request(app).get('/api/v1/admin/disputes').set(adminAuth);
    expect(res.status).toBe(200);
    const page = unwrap(res);
    expect(page.items.map((d: any) => d.id)).toEqual([id]);
    expect(page.total).toBe(1);

    const open = await request(app).get('/api/v1/admin/disputes?status=open').set(adminAuth);
    expect(unwrap(open).items).toHaveLength(1);
    expect(unwrap(open).items[0].status).toBe('open');

    const bad = await request(app).get('/api/v1/admin/disputes?status=nope').set(adminAuth);
    expect(bad.status).toBe(400);
  });
});

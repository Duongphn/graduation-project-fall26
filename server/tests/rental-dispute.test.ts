import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Dispute, RentalOrder, Wallet, WalletTransaction } from '../src/models/index.js';
import { rulingSplit } from '../src/services/rental-pricing.js';
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
const DECISION = 'Ảnh lúc trả cho thấy càng xe bị gãy, ảnh lúc nhận thì còn nguyên vẹn.';

describe('rulingSplit (R03 I.2.6.6)', () => {
  const base = { rentalFee: 150_000, depositAmount: 200_000, platformFeeRate: 0.1, lateFee: 0 };

  it('R03 example 1b: 25% of the deposit as compensation', () => {
    expect(rulingSplit({ ...base, compensation: 50_000, rentRefund: 0 })).toEqual({
      frozen: 350_000,
      owner: 185_000,
      platform: 15_000,
      renter: 150_000,
    });
  });

  it('takes the platform fee only on the rent the owner keeps', () => {
    const split = rulingSplit({ ...base, compensation: 0, rentRefund: 75_000 });
    expect(split).toEqual({ frozen: 350_000, owner: 67_500, platform: 7_500, renter: 275_000 });
    expect(split.owner + split.platform + split.renter).toBe(split.frozen);
  });

  it('keeps L + K within the deposit and G within the rent', () => {
    expect(() => rulingSplit({ ...base, lateFee: 100_000, compensation: 100_001, rentRefund: 0 })).toThrow(
      'RULING_EXCEEDS_LIMIT',
    );
    expect(() => rulingSplit({ ...base, compensation: 0, rentRefund: 150_001 })).toThrow(
      'RULING_EXCEEDS_LIMIT',
    );
    expect(rulingSplit({ ...base, lateFee: 100_000, compensation: 100_000, rentRefund: 0 })).toEqual({
      frozen: 350_000,
      owner: 335_000,
      platform: 15_000,
      renter: 0,
    });
  });
});

describe('UC19: Admin resolves a rental dispute', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let ledger: any;
  let ownerId: string;
  let renterId: string;
  let adminId: string;
  let ownerAuth: any;
  let renterAuth: any;
  let adminAuth: any;

  const unwrap = (res: request.Response) => res.body.data;
  const errorOf = (res: request.Response) => res.body.error;

  const sumBalances = async () => {
    const res = await Wallet.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]);
    return res[0]?.total ?? 0;
  };

  const balances = async () => ({
    escrow: (await ledger.getOrCreateSystemWallet('escrow')).balance,
    owner: (await ledger.getOrCreateUserWallet(ownerId)).balance,
    platform: (await ledger.getOrCreateSystemWallet('platform')).balance,
    renter: (await ledger.getOrCreateUserWallet(renterId)).balance,
  });

  /** Đơn 05–07/11 (R = 150k, D = 200k), trả ngày `returnAt`, chủ đồ báo hư hỏng. */
  const disputedOrder = async (returnAt = '2026-11-07T10:00:00Z') => {
    clock.set('2026-11-01T03:00:00Z');
    const toy = await createRentToy(ownerId);
    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId: toy._id.toString(), startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(created).id as string;
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    await request(app).post(`/api/v1/rentals/${orderId}/ship`).set(ownerAuth).attach('photos', JPEG, 'ship.jpg');
    await request(app).post(`/api/v1/rentals/${orderId}/receive`).set(renterAuth).attach('photos', JPEG, 'recv.jpg');
    clock.set(returnAt);
    await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .field('note', 'Trả đủ hộp và phụ kiện')
      .attach('photos', JPEG, 'ret.jpg');
    const damaged = await request(app)
      .post(`/api/v1/rentals/${orderId}/settle`)
      .set(ownerAuth)
      .field('result', 'DAMAGED')
      .field('description', 'Đồ chơi bị gãy càng trước khi nhận lại.')
      .attach('photos', JPEG, 'damage.jpg');
    expect(unwrap(damaged).status).toBe('DISPUTING');
    return { orderId, disputeId: unwrap(damaged).settlement.disputeId as string };
  };

  const resolve = (disputeId: string, body: Record<string, unknown>, auth = adminAuth) =>
    request(app).post(`/api/v1/admin/disputes/${disputeId}/resolve`).set(auth).send(body);

  /** Hết 72 giờ phản hồi của người thuê (GB-24). */
  const afterReplyWindow = () => clock.advanceHours(72);

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

    ownerId = (await createUser({ fullName: 'Chủ Đồ' }))._id.toString();
    renterId = (await createUser({ fullName: 'Người Thuê' }))._id.toString();
    adminId = (await createUser({ role: 'ADMIN' }))._id.toString();
    ownerAuth = authHeader(ownerId);
    renterAuth = authHeader(renterId);
    adminAuth = authHeader(adminId, 'ADMIN');
  });

  it('links the Admin notification to the case and sets the 72-hour reply deadline', async () => {
    const { disputeId } = await disputedOrder();
    const toAdmin = notifier.sent.find((n: any) => n.userId === adminId);
    expect(toAdmin.link).toBe(`/admin/disputes/${disputeId}`);
    const dispute = await Dispute.findById(disputeId);
    expect(dispute?.timer?.dueAt?.toISOString()).toBe('2026-11-10T10:00:00.000Z');
  });

  it('lists open disputes and shows the evidence of both sides, Admin only', async () => {
    const { orderId, disputeId } = await disputedOrder();

    expect((await request(app).get('/api/v1/admin/disputes').set(ownerAuth)).status).toBe(403);

    const list = await request(app).get('/api/v1/admin/disputes').set(adminAuth);
    expect(list.status).toBe(200);
    expect(list.body.pagination.totalItems).toBe(1);
    expect(list.body.data[0]).toMatchObject({
      id: disputeId,
      status: 'open',
      claimant: 'owner',
      frozenAmount: 350_000,
      replyDueAt: '2026-11-10T10:00:00.000Z',
      order: { id: orderId, status: 'DISPUTING' },
      owner: { fullName: 'Chủ Đồ' },
      renter: { fullName: 'Người Thuê', trustScore: 80 },
      toy: { title: 'Test Lego Toy' },
    });

    const resolved = await request(app).get('/api/v1/admin/disputes?status=resolved').set(adminAuth);
    expect(resolved.body.data).toEqual([]);

    const detail = unwrap(await request(app).get(`/api/v1/admin/disputes/${disputeId}`).set(adminAuth));
    expect(detail.description).toBe('Đồ chơi bị gãy càng trước khi nhận lại.');
    expect(detail.rentalOrder.handover.ownerPhotos).toHaveLength(1);
    expect(detail.rentalOrder.handover.renterPhotos).toHaveLength(1);
    expect(detail.rentalOrder.returnInfo).toMatchObject({ note: 'Trả đủ hộp và phụ kiện', lateFee: 0 });
    expect(detail.rentalOrder.settlement.evidencePhotos).toHaveLength(1);
    expect(detail.history.map((h: any) => h.newStatus)).toEqual([
      'PENDING',
      'ACCEPTED',
      'PAID',
      'SHIPPING',
      'IN_USE',
      'RETURNING',
      'DISPUTING',
    ]);
    expect(detail.resolution).toBeUndefined();

    expect((await request(app).get('/api/v1/admin/disputes/000000000000000000000000').set(adminAuth)).status).toBe(404);
  });

  it('waits for the reply window, then pays out R + D as decided (R03 example 1b)', async () => {
    const { orderId, disputeId } = await disputedOrder();
    const body = { ruling: 'RENTER_AT_FAULT', compensationRate: 25, adminDecision: DECISION };

    const early = await resolve(disputeId, body);
    expect(early.status).toBe(409);
    expect(errorOf(early).code).toBe('DISPUTE_REPLY_PENDING');

    afterReplyWindow();
    expect((await resolve(disputeId, body, ownerAuth)).status).toBe(403);

    const res = await resolve(disputeId, body);
    expect(res.status).toBe(200);
    expect(unwrap(res).resolution).toMatchObject({
      ruling: 'RENTER_AT_FAULT',
      compensationRate: 25,
      compensationAmount: 50_000,
      rentRefundAmount: 0,
      ownerAmount: 185_000,
      renterAmount: 150_000,
      platformFee: 15_000,
      adminDecision: DECISION,
      resolvedBy: adminId,
    });

    // Escrow trả hết 350k: chủ đồ R − F + K, nền tảng F, người thuê D − K
    expect(await balances()).toEqual({ escrow: 0, owner: 185_000, platform: 15_000, renter: 300_000 });
    expect(await sumBalances()).toBe(0);
    const txs = await WalletTransaction.find({ postingKey: `rental:${orderId}:ruling` });
    expect(txs).toHaveLength(4);

    const order = await RentalOrder.findById(orderId);
    expect(order?.status).toBe('COMPLETED');
    expect(order?.settlement?.resolution).toMatchObject({ ownerAmount: 185_000, renterAmount: 150_000 });
    const dispute = await Dispute.findById(disputeId);
    expect(dispute?.status).toBe('resolved');
    expect(dispute?.resolvedBy?.toString()).toBe(adminId);

    const ruling = notifier.sent.filter((n: any) => n.type === 'DISPUTE');
    expect(ruling.map((n: any) => [n.userId, n.party])).toEqual([
      [ownerId, 'owner'],
      [renterId, 'renter'],
    ]);
    expect(ruling[0].body).toContain('185.000 VND');
    expect(ruling[1].body).toContain('150.000 VND');
    expect(ruling[1].body).toContain(DECISION);

    // Phán quyết không sửa được (GB-26)
    const again = await resolve(disputeId, { ...body, compensationRate: 100 });
    expect(again.status).toBe(409);
    expect(errorOf(again).code).toBe('DISPUTE_ALREADY_RESOLVED');
    expect(await balances()).toEqual({ escrow: 0, owner: 185_000, platform: 15_000, renter: 300_000 });

    const list = await request(app).get('/api/v1/admin/disputes?status=resolved').set(adminAuth);
    expect(list.body.data[0]).toMatchObject({ id: disputeId, status: 'resolved' });
  });

  it('caps the compensation at the deposit left after the late fee (L + K ≤ D)', async () => {
    // Trả trễ 2 ngày: L = 100k
    const { orderId, disputeId } = await disputedOrder('2026-11-09T03:00:00Z');
    afterReplyWindow();
    const res = await resolve(disputeId, {
      ruling: 'RENTER_AT_FAULT',
      compensationRate: 100,
      adminDecision: DECISION,
    });
    expect(res.status).toBe(200);
    expect(unwrap(res).resolution).toMatchObject({ compensationAmount: 100_000, renterAmount: 0 });
    // Chủ đồ: 150k − 15k + L 100k + K 100k; người thuê không nhận gì (dòng 0 đồng bị bỏ)
    expect(await balances()).toEqual({ escrow: 0, owner: 335_000, platform: 15_000, renter: 150_000 });
    expect(await sumBalances()).toBe(0);
    expect(await WalletTransaction.countDocuments({ postingKey: `rental:${orderId}:ruling` })).toBe(3);
  });

  it('a no-fault ruling refunds the whole deposit and allows no compensation', async () => {
    const { disputeId } = await disputedOrder();
    afterReplyWindow();

    const withRate = await resolve(disputeId, {
      ruling: 'FAIR_WEAR_AND_TEAR',
      compensationRate: 50,
      adminDecision: DECISION,
    });
    expect(withRate.status).toBe(400);

    const res = await resolve(disputeId, {
      ruling: 'FAIR_WEAR_AND_TEAR',
      compensationRate: 0,
      adminDecision: DECISION,
    });
    expect(res.status).toBe(200);
    expect(await balances()).toEqual({ escrow: 0, owner: 135_000, platform: 15_000, renter: 350_000 });
  });

  it('validates the ruling, the rate and a 30–500 character reason', async () => {
    const { disputeId } = await disputedOrder();
    afterReplyWindow();
    const bad = [
      { ruling: 'RENTER_AT_FAULT', compensationRate: 25, adminDecision: 'Quá ngắn' },
      { ruling: 'RENTER_AT_FAULT', compensationRate: 30, adminDecision: DECISION },
      { ruling: 'SOMEONE', compensationRate: 0, adminDecision: DECISION },
      { ruling: 'RENTER_AT_FAULT', compensationRate: 25, adminDecision: 'x'.repeat(501) },
    ];
    for (const body of bad) {
      const res = await resolve(disputeId, body);
      expect(res.status).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_ERROR');
    }
    expect(await balances()).toMatchObject({ escrow: 350_000, owner: 0 });
  });

  it('pays out only once when two Admins decide at the same time', async () => {
    const { orderId, disputeId } = await disputedOrder();
    afterReplyWindow();
    const body = { ruling: 'RENTER_AT_FAULT', compensationRate: 50, adminDecision: DECISION };
    const results = await Promise.all([resolve(disputeId, body), resolve(disputeId, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    // K = 100k: chủ đồ 135k + 100k, người thuê 500k − 350k + 100k
    expect(await balances()).toEqual({ escrow: 0, owner: 235_000, platform: 15_000, renter: 250_000 });
    expect(await WalletTransaction.countDocuments({ postingKey: `rental:${orderId}:ruling` })).toBe(4);
  });
});

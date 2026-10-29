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

describe('UC11: Settle Returned Rental (GOOD or DAMAGED)', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let photoStorage: any;
  let ledger: any;
  let toyId: string;
  let ownerId: string;
  let renterId: string;
  let adminId: string;
  let renterAuth: any;
  let ownerAuth: any;
  let orderId: string;

  const unwrap = (res: request.Response) => res.body.data;
  const errorOf = (res: request.Response) => res.body.error;

  const sumBalances = async () => {
    const res = await Wallet.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]);
    return res[0]?.total ?? 0;
  };

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
    photoStorage = built.photoStorage;
    ledger = built.ledger;

    const owner = await createUser();
    ownerId = owner._id.toString();
    ownerAuth = authHeader(ownerId);

    const renter = await createUser();
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);

    const admin = await createUser({ role: 'ADMIN' });
    adminId = admin._id.toString();

    // priceOrRate: 50k, depositPrice: 200k
    const toy = await createRentToy(ownerId);
    toyId = toy._id.toString();

    // 1. Create order 11-05 to 11-07
    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    orderId = unwrap(created).id;

    // 2. Accept
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);

    // 3. Fund & Pay
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);

    // 4. Ship
    await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');

    // 5. Receive
    await request(app)
      .post(`/api/v1/rentals/${orderId}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');

    // 6. Return on-time
    clock.set('2026-11-07T10:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');
  });

  it('good condition settles money', async () => {
    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/settle`)
      .set(ownerAuth)
      .send({ result: 'GOOD' });

    expect(res.status).toBe(200);
    const data = unwrap(res);
    expect(data.status).toBe('COMPLETED');
    expect(data.settlement).toMatchObject({
      result: 'GOOD',
      settledAt: '2026-11-07T10:00:00.000Z',
    });
    expect(data.timer).toBeUndefined();

    // Ledger checks
    const escrowWallet = await ledger.getOrCreateSystemWallet('escrow');
    const ownerWallet = await ledger.getOrCreateUserWallet(ownerId);
    const platformWallet = await ledger.getOrCreateSystemWallet('platform');
    const renterWallet = await ledger.getOrCreateUserWallet(renterId);

    // R = 150k, D = 200k, F = 15k, L = 0
    // Escrow: was 350k, debited 350k -> 0
    // Owner: 150k - 15k = 135k
    // Platform: 15k
    // Renter: 500k funded - 350k paid + 200k deposit refunded = 350k
    expect(escrowWallet.balance).toBe(0);
    expect(ownerWallet.balance).toBe(135_000);
    expect(platformWallet.balance).toBe(15_000);
    expect(renterWallet.balance).toBe(350_000);
    expect(await sumBalances()).toBe(0);

    const txs = await WalletTransaction.find({ postingKey: `rental:${orderId}:settle` });
    expect(txs).toHaveLength(4);

    expect(notifier.sent.some((n: any) => n.userId === renterId)).toBe(true);
    expect(notifier.sent.some((n: any) => n.userId === ownerId)).toBe(true);
  });

  it('good condition with late fee', async () => {
    // Reset order and return 2 days late
    clock.set('2026-11-01T03:00:00Z');
    const renter2 = await createUser();
    const renter2Id = renter2._id.toString();
    const renter2Auth = authHeader(renter2Id);
    await fund(renter2Id, 500_000);

    const owner2 = await createUser();
    const owner2Id = owner2._id.toString();
    const owner2Auth = authHeader(owner2Id);

    const toy2 = await createRentToy(owner2Id);
    const created2 = await request(app)
      .post('/api/v1/rentals')
      .set(renter2Auth)
      .send({ toyId: toy2._id.toString(), startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId2 = unwrap(created2).id;

    await request(app).post(`/api/v1/rentals/${orderId2}/accept`).set(owner2Auth);
    await request(app).post(`/api/v1/rentals/${orderId2}/pay`).set(renter2Auth);
    await request(app)
      .post(`/api/v1/rentals/${orderId2}/ship`)
      .set(owner2Auth)
      .attach('photos', JPEG, 'ship.jpg');
    await request(app)
      .post(`/api/v1/rentals/${orderId2}/receive`)
      .set(renter2Auth)
      .attach('photos', JPEG, 'receive.jpg');

    // Return 2 days late: L = 100_000
    clock.set('2026-11-09T03:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${orderId2}/return`)
      .set(renter2Auth)
      .attach('photos', JPEG, 'return.jpg');

    // Settle
    const res = await request(app)
      .post(`/api/v1/rentals/${orderId2}/settle`)
      .set(owner2Auth)
      .send({ result: 'GOOD' });

    expect(res.status).toBe(200);

    const ownerWallet = await ledger.getOrCreateUserWallet(owner2Id);
    const renterWallet = await ledger.getOrCreateUserWallet(renter2Id);

    // R = 150k, D = 200k, F = 15k, L = 100k
    // Owner: R - F + L = 150k - 15k + 100k = 235k
    // Platform: 15k
    // Renter refund: D - L = 200k - 100k = 100k
    expect(ownerWallet.balance).toBe(235_000);
    // Renter: 500k funded - 350k paid + 100k refund = 250k
    expect(renterWallet.balance).toBe(250_000);
    expect(await sumBalances()).toBe(0);
  });

  // Review Focus #2
  it('zero deposit omits zero entries', async () => {
    clock.set('2026-11-01T03:00:00Z');
    // Create toy without deposit
    const zeroDepToy = await createRentToy(ownerId, { depositPrice: 0 });
    const zeroDepToyId = zeroDepToy._id.toString();

    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId: zeroDepToyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const zeroOrderId = unwrap(created).id;

    await request(app).post(`/api/v1/rentals/${zeroOrderId}/accept`).set(ownerAuth);
    await request(app).post(`/api/v1/rentals/${zeroOrderId}/pay`).set(renterAuth);
    await request(app)
      .post(`/api/v1/rentals/${zeroOrderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');
    await request(app)
      .post(`/api/v1/rentals/${zeroOrderId}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');

    // Return 2 days late: raw late fee 100k, capped at deposit 0 -> lateFee = 0
    clock.set('2026-11-09T03:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${zeroOrderId}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');

    const res = await request(app)
      .post(`/api/v1/rentals/${zeroOrderId}/settle`)
      .set(ownerAuth)
      .send({ result: 'GOOD' });

    expect(res.status).toBe(200);

    const txs = await WalletTransaction.find({ postingKey: `rental:${zeroOrderId}:settle` });
    expect(txs).toHaveLength(3); // Escrow, Owner, Platform; Renter omitted
    expect(txs.some((t) => t.amount === 0)).toBe(false);

    const ownerWallet = await ledger.getOrCreateUserWallet(ownerId);
    const platformWallet = await ledger.getOrCreateSystemWallet('platform');
    expect(ownerWallet.balance).toBe(135_000);
    expect(platformWallet.balance).toBe(15_000);
    expect(await sumBalances()).toBe(0);
  });

  it('damaged opens a dispute and holds escrow', async () => {
    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/settle`)
      .set(ownerAuth)
      .field('result', 'DAMAGED')
      .field('description', 'Đồ chơi bị nứt phần thân và mất 1 bánh xe.')
      .attach('photos', JPEG, 'damaged1.jpg');

    expect(res.status).toBe(200);
    const data = unwrap(res);
    expect(data.status).toBe('DISPUTING');
    expect(data.settlement).toMatchObject({
      result: 'DAMAGED',
      description: 'Đồ chơi bị nứt phần thân và mất 1 bánh xe.',
    });
    expect(data.settlement.evidencePhotos).toHaveLength(1);
    expect(data.settlement.disputeId).toBeDefined();

    // Escrow holds the full amount (350k)
    const escrowWallet = await ledger.getOrCreateSystemWallet('escrow');
    expect(escrowWallet.balance).toBe(350_000);
    const ownerWallet = await ledger.getOrCreateUserWallet(ownerId);
    expect(ownerWallet.balance).toBe(0);

    // Dispute doc created in DB
    const dispute = await Dispute.findById(data.settlement.disputeId);
    expect(dispute).not.toBeNull();
    expect(dispute).toMatchObject({
      orderType: 'rental_order',
      reason: 'DAMAGED_ON_RETURN',
      status: 'open',
      description: 'Đồ chơi bị nứt phần thân và mất 1 bánh xe.',
    });
    expect(dispute?.claimantId.toString()).toBe(ownerId);
    expect(dispute?.respondentId.toString()).toBe(renterId);

    // Renter and Admin notified
    expect(notifier.sent.some((n: any) => n.userId === renterId)).toBe(true);
    expect(notifier.sent.some((n: any) => n.userId === adminId)).toBe(true);
  });

  it('damaged requires evidence and description', async () => {
    // No photos
    const noPhotos = await request(app)
      .post(`/api/v1/rentals/${orderId}/settle`)
      .set(ownerAuth)
      .send({
        result: 'DAMAGED',
        description: 'Đồ chơi bị nứt phần thân và mất 1 bánh xe.',
      });
    expect(noPhotos.status).toBe(400);

    // Description too short (< 10 chars)
    const shortDesc = await request(app)
      .post(`/api/v1/rentals/${orderId}/settle`)
      .set(ownerAuth)
      .field('result', 'DAMAGED')
      .field('description', 'hỏng rồi')
      .attach('photos', JPEG, 'evidence.jpg');
    expect(shortDesc.status).toBe(400);
    expect(errorOf(shortDesc).code).toBe('VALIDATION_ERROR');

    // Status stays RETURNING
    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('RETURNING');
    // Mô tả sai bị chặn trước khi upload: không có ảnh nào bị đưa lên Cloudinary
    expect(photoStorage.uploaded).toHaveLength(3); // chỉ ảnh ship/receive/return của fixture
  });

  it('keeps dispute evidence when a notification fails after commit', async () => {
    notifier.notifier.notify = async () => {
      throw new Error('notification store down');
    };

    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/settle`)
      .set(ownerAuth)
      .field('result', 'DAMAGED')
      .field('description', 'Đồ chơi bị nứt phần thân và mất 1 bánh xe.')
      .attach('photos', JPEG, 'evidence.jpg');

    expect(res.status).toBe(200);
    const evidenceId = photoStorage.uploaded[photoStorage.uploaded.length - 1];
    expect(photoStorage.deleted).not.toContain(evidenceId);
    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('DISPUTING');
    expect(checkOrder?.settlement?.evidencePhotos?.[0]?.publicId).toBe(evidenceId);
  });

  it('settles two orders of a walletless owner concurrently', async () => {
    clock.set('2026-11-01T03:00:00Z');
    const owner2 = await createUser();
    const owner2Id = owner2._id.toString();
    const owner2Auth = authHeader(owner2Id);
    const orderIds: string[] = [];

    for (const startDate of ['2026-11-05', '2026-11-10']) {
      const toy = await createRentToy(owner2Id);
      const created = await request(app)
        .post('/api/v1/rentals')
        .set(renterAuth)
        .send({ toyId: toy._id.toString(), startDate, endDate: startDate });
      const id = unwrap(created).id;
      await request(app).post(`/api/v1/rentals/${id}/accept`).set(owner2Auth);
      await fund(renterId, 250_000);
      await request(app).post(`/api/v1/rentals/${id}/pay`).set(renterAuth);
      await request(app).post(`/api/v1/rentals/${id}/ship`).set(owner2Auth).attach('photos', JPEG, 's.jpg');
      await request(app).post(`/api/v1/rentals/${id}/receive`).set(renterAuth).attach('photos', JPEG, 'r.jpg');
      await request(app).post(`/api/v1/rentals/${id}/return`).set(renterAuth).attach('photos', JPEG, 't.jpg');
      orderIds.push(id);
    }

    expect(await Wallet.countDocuments({ userId: owner2._id })).toBe(0);
    const results = await Promise.all(
      orderIds.map((id) =>
        request(app).post(`/api/v1/rentals/${id}/settle`).set(owner2Auth).send({ result: 'GOOD' }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await Wallet.countDocuments({ userId: owner2._id })).toBe(1);
    // Mỗi đơn 1 ngày: R = 50k, F = 5k → owner nhận 45k × 2
    expect((await ledger.getOrCreateUserWallet(owner2Id)).balance).toBe(90_000);
    expect(await sumBalances()).toBe(0);
  });

  it('only the owner settles, once', async () => {
    // Renter tries to settle -> 403
    const renterRes = await request(app)
      .post(`/api/v1/rentals/${orderId}/settle`)
      .set(renterAuth)
      .send({ result: 'GOOD' });
    expect(renterRes.status).toBe(403);
    expect(errorOf(renterRes).code).toBe('FORBIDDEN_RENTAL_ACTION');

    // Owner settles successfully
    const first = await request(app)
      .post(`/api/v1/rentals/${orderId}/settle`)
      .set(ownerAuth)
      .send({ result: 'GOOD' });
    expect(first.status).toBe(200);

    // Second settle -> 409
    const second = await request(app)
      .post(`/api/v1/rentals/${orderId}/settle`)
      .set(ownerAuth)
      .send({ result: 'GOOD' });
    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe('INVALID_RENTAL_TRANSITION');
  });

  it('rejects a damage report after the settlement deadline', async () => {
    // Trả đồ lúc 2026-11-07T10:00Z, hạn đối soát là 72h sau; scheduler chưa chạy
    clock.set('2026-11-10T10:00:00Z');
    const uploadedBefore = photoStorage.uploaded.length;
    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/settle`)
      .set(ownerAuth)
      .field('result', 'DAMAGED')
      .field('description', 'Đồ chơi bị nứt phần thân và mất 1 bánh xe.')
      .attach('photos', JPEG, 'evidence.jpg');

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('INVALID_RENTAL_TRANSITION');
    expect(photoStorage.uploaded).toHaveLength(uploadedBefore);
    expect((await RentalOrder.findById(orderId))?.status).toBe('RETURNING');
  });

  it('autoSettle completes as GOOD after 72h', async () => {
    const container = (app as any).locals?.container;
    const service = container.rentalSystemService;

    // Advance 24h (not yet 72h)
    clock.advanceHours(24);
    await service.autoSettle(orderId);

    // Still RETURNING
    let checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('RETURNING');

    // Advance to 72h
    clock.advanceHours(48);
    await service.autoSettle(orderId);

    checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('COMPLETED');
    expect(checkOrder?.settlement?.result).toBe('GOOD');
    expect(checkOrder?.settlement?.autoSettled).toBe(true);

    const escrowWallet = await ledger.getOrCreateSystemWallet('escrow');
    expect(escrowWallet.balance).toBe(0);
    const ownerWallet = await ledger.getOrCreateUserWallet(ownerId);
    expect(ownerWallet.balance).toBe(135_000);
  });
});

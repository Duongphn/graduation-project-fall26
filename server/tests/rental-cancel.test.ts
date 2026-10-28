import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  OrderStatusHistory,
  RentalOrder,
  Wallet,
  WalletTransaction,
} from '../src/models/index.js';
import { RentalTimerService } from '../src/services/rental-timer.service.js';
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

describe('UC14: Cancel Order & Escrow Refunds', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let timerService: RentalTimerService;
  let toyId: string;
  let ownerId: string;
  let renterId: string;
  let renterAuth: any;
  let ownerAuth: any;

  const unwrap = (res: request.Response) => res.body.data;
  const errorOf = (res: request.Response) => res.body.error;

  const sumBalances = async () => {
    const res = await Wallet.aggregate<{ total: number }>([
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]);
    return res[0]?.total ?? 0;
  };

  const cancel = (auth: any, id: string, reason = 'Đổi kế hoạch gia đình') =>
    request(app).post(`/api/v1/rentals/${id}/cancel`).set(auth).send({ reason });

  const toPaid = async () => {
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(res).id;
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    await fund(renterId, 350_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    return orderId;
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

    const container = (app as any).locals?.container;
    timerService = new RentalTimerService(
      container.rentalSystemService,
      container.rentalOrderRepository,
      clock,
    );

    const owner = await createUser({ email: 'owner@toyflow.test', verified: true });
    ownerId = owner._id.toString();
    ownerAuth = authHeader(ownerId);

    const renter = await createUser({ email: 'renter@toyflow.test', verified: true });
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);

    const toy = await createRentToy(ownerId);
    toyId = toy._id.toString();
  });

  it('renter cancels PENDING: 200, no ledger rows, dates bookable again', async () => {
    const resCreate = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(resCreate).id;

    const res = await cancel(renterAuth, orderId);
    expect(res.status).toBe(200);
    const data = unwrap(res);
    expect(data.status).toBe('CANCELLED');
    expect(data.cancellation).toEqual({
      by: 'RENTER',
      userId: renterId,
      reason: 'Đổi kế hoạch gia đình',
      fee: 0,
      cancelledAt: '2026-11-01T03:00:00.000Z',
    });

    const tx = await WalletTransaction.findOne({ 'reference.id': orderId });
    expect(tx).toBeNull();

    // Re-booking on the exact same dates succeeds (201)
    const rebook = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    expect(rebook.status).toBe(201);
  });

  it('renter and owner can cancel ACCEPTED: 200, no ledger rows', async () => {
    const res1 = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const id1 = unwrap(res1).id;
    await request(app).post(`/api/v1/rentals/${id1}/accept`).set(ownerAuth);

    const resCancelRenter = await cancel(renterAuth, id1);
    expect(resCancelRenter.status).toBe(200);
    expect(unwrap(resCancelRenter).status).toBe('CANCELLED');
    expect(unwrap(resCancelRenter).cancellation.by).toBe('RENTER');

    // Second order for owner cancel test
    const res2 = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const id2 = unwrap(res2).id;
    await request(app).post(`/api/v1/rentals/${id2}/accept`).set(ownerAuth);

    const resCancelOwner = await cancel(ownerAuth, id2);
    expect(resCancelOwner.status).toBe(200);
    expect(unwrap(resCancelOwner).status).toBe('CANCELLED');
    expect(unwrap(resCancelOwner).cancellation.by).toBe('OWNER');

    const txs = await WalletTransaction.find({ 'reference.id': { $in: [id1, id2] } });
    expect(txs).toHaveLength(0);
  });

  it('owner cancels PENDING: 409 RENTAL_CANCEL_USE_REJECT, order still PENDING', async () => {
    const resCreate = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(resCreate).id;

    const res = await cancel(ownerAuth, orderId);
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('RENTAL_CANCEL_USE_REJECT');

    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('PENDING');
  });

  it('renter cancels PAID: fee charged, refund returned, ledger balanced', async () => {
    const orderId = await toPaid();
    const balanceBefore = await sumBalances();

    const res = await cancel(renterAuth, orderId);
    expect(res.status).toBe(200);
    const data = unwrap(res);
    expect(data.status).toBe('CANCELLED');
    expect(data.cancellation).toEqual({
      by: 'RENTER',
      userId: renterId,
      reason: 'Đổi kế hoạch gia đình',
      fee: 30_000,
      cancelledAt: '2026-11-01T03:00:00.000Z',
    });

    const renterW = await Wallet.findOne({ userId: renterId });
    const ownerW = await Wallet.findOne({ userId: ownerId });
    const escrowW = await Wallet.findOne({ ownerType: 'escrow' });

    expect(renterW?.balance).toBe(320_000);
    expect(ownerW?.balance).toBe(30_000);
    expect(escrowW?.balance).toBe(0);

    const balanceAfter = await sumBalances();
    expect(balanceAfter).toBe(balanceBefore);

    const history = await OrderStatusHistory.find({ orderId });
    const cancelHistory = history.find((h) => h.newStatus === 'CANCELLED');
    expect(cancelHistory).toBeDefined();
    expect(cancelHistory?.oldStatus).toBe('PAID');
    expect(cancelHistory?.changedBy.toString()).toBe(renterId);
    expect(cancelHistory?.notes?.startsWith('cancel:RENTER: ')).toBe(true);
  });

  it('renter cancels PAID after rental start: fee waived, full refund', async () => {
    const orderId = await toPaid();
    clock.set('2026-11-04T17:00:00Z'); // startOfRental for 2026-11-05

    const res = await cancel(renterAuth, orderId);
    expect(res.status).toBe(200);
    expect(unwrap(res).cancellation.fee).toBe(0);

    const renterW = await Wallet.findOne({ userId: renterId });
    const ownerW = await Wallet.findOne({ userId: ownerId });
    expect(renterW?.balance).toBe(350_000);
    expect(ownerW?.balance ?? 0).toBe(0);
  });

  it('owner cancels PAID: full refund, no owner fee', async () => {
    const orderId = await toPaid();

    const res = await cancel(ownerAuth, orderId);
    expect(res.status).toBe(200);
    expect(unwrap(res).cancellation).toEqual({
      by: 'OWNER',
      userId: ownerId,
      reason: 'Đổi kế hoạch gia đình',
      fee: 0,
      cancelledAt: '2026-11-01T03:00:00.000Z',
    });

    const renterW = await Wallet.findOne({ userId: renterId });
    const ownerW = await Wallet.findOne({ userId: ownerId });
    expect(renterW?.balance).toBe(350_000);
    expect(ownerW?.balance ?? 0).toBe(0);
  });

  it('cannot cancel SHIPPING: 409 RENTAL_CANCEL_NOT_ALLOWED', async () => {
    const orderId = await toPaid();

    // Owner ships
    const shipRes = await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'p1.jpg')
      .attach('photos', JPEG, 'p2.jpg');
    expect(shipRes.status).toBe(200);

    const res = await cancel(renterAuth, orderId);
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('RENTAL_CANCEL_NOT_ALLOWED');
  });

  it('second cancel is rejected with 409 INVALID_RENTAL_TRANSITION', async () => {
    const orderId = await toPaid();

    const first = await cancel(renterAuth, orderId);
    expect(first.status).toBe(200);

    const second = await cancel(renterAuth, orderId);
    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe('INVALID_RENTAL_TRANSITION');

    const renterW = await Wallet.findOne({ userId: renterId });
    expect(renterW?.balance).toBe(320_000);
  });

  it('parallel cancels on PAID: exactly one succeeds and one cancel posting made', async () => {
    const orderId = await toPaid();

    const [resRenter, resOwner] = await Promise.all([
      cancel(renterAuth, orderId),
      cancel(ownerAuth, orderId),
    ]);

    const statuses = [resRenter.status, resOwner.status].sort();
    expect(statuses).toEqual([200, 409]);

    const cancelPostings = await WalletTransaction.find({
      postingKey: `rental:${orderId}:cancel`,
    });
    expect(cancelPostings.length).toBeGreaterThanOrEqual(1);
    const distinctKeys = new Set(cancelPostings.map((p) => p.postingKey));
    expect(distinctKeys.size).toBe(1);
  });

  it('cancel wins over an overdue PAYMENT timer', async () => {
    const resCreate = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(resCreate).id;
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);

    clock.advanceHours(13); // Payment deadline was 12h

    const res = await cancel(renterAuth, orderId);
    expect(res.status).toBe(200);
    expect(unwrap(res).status).toBe('CANCELLED');

    // Running due timers afterward does not change CANCELLED status
    await timerService.runDue();
    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('CANCELLED');
  });

  it('PAYMENT timer wins over a later cancel', async () => {
    const resCreate = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(resCreate).id;
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);

    clock.advanceHours(13);
    const runResult = await timerService.runDue();
    expect(runResult.processed).toBe(1);

    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('EXPIRED');

    const res = await cancel(renterAuth, orderId);
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('INVALID_RENTAL_TRANSITION');
  });

  it('notifies both parties when order is cancelled', async () => {
    const orderId = await toPaid();
    notifier.sent.length = 0; // reset captured notifications

    const res = await cancel(renterAuth, orderId);
    expect(res.status).toBe(200);

    const renterNotif = notifier.sent.find((n: any) => n.userId === renterId);
    const ownerNotif = notifier.sent.find((n: any) => n.userId === ownerId);
    expect(renterNotif).toBeDefined();
    expect(ownerNotif).toBeDefined();
    expect(renterNotif.title).toBe('Đơn thuê đã bị hủy');
    expect(ownerNotif.title).toBe('Đơn thuê đã bị hủy');
  });

  it('stranger gets 404 RENTAL_NOT_FOUND', async () => {
    const orderId = await toPaid();
    const stranger = await createUser({ email: 'stranger@toyflow.test', verified: true });
    const strangerAuth = authHeader(stranger._id.toString());

    const res = await cancel(strangerAuth, orderId);
    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe('RENTAL_NOT_FOUND');
  });

  it('rejects blank reason with 400 VALIDATION_ERROR', async () => {
    const orderId = await toPaid();

    const blank = await request(app)
      .post(`/api/v1/rentals/${orderId}/cancel`)
      .set(renterAuth)
      .send({ reason: '    ' });
    expect(blank.status).toBe(400);
    expect(errorOf(blank).code).toBe('VALIDATION_ERROR');

    const missing = await request(app)
      .post(`/api/v1/rentals/${orderId}/cancel`)
      .set(renterAuth)
      .send({});
    expect(missing.status).toBe(400);
    expect(errorOf(missing).code).toBe('VALIDATION_ERROR');
  });
});

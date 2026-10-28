import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderStatusHistory, RentalOrder, Wallet } from '../src/models/index.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
  fund,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';
import { RentalTimerService } from '../src/services/rental-timer.service.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe('UC12: Rental Timers and Scheduler', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let ledger: any;
  let timerService: RentalTimerService;
  let rentalService: any;
  let repository: any;
  let toyId: string;
  let ownerId: string;
  let renterId: string;
  let renterAuth: any;
  let ownerAuth: any;

  const unwrap = (res: request.Response) => res.body.data;

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
    ledger = built.ledger;

    const container = (app as any).locals?.container;
    rentalService = container.rentalSystemService;
    repository = container.rentalOrderRepository;
    timerService = new RentalTimerService(rentalService, repository, clock);

    const owner = await createUser();
    ownerId = owner._id.toString();
    ownerAuth = authHeader(ownerId);

    const renter = await createUser();
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);

    const toy = await createRentToy(ownerId);
    toyId = toy._id.toString();
  });

  it('expires unanswered requests after 24h and frees the dates', async () => {
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(res).id;

    // At +23h: not due yet
    clock.advanceHours(23);
    const firstRun = await timerService.runDue();
    expect(firstRun.processed).toBe(0);

    let checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('PENDING');

    // At +24h: due
    clock.advanceHours(1);
    const secondRun = await timerService.runDue();
    expect(secondRun.processed).toBe(1);

    checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('EXPIRED');
    expect(checkOrder?.timer?.kind).toBeUndefined();

    const history = await OrderStatusHistory.findOne({
      orderId,
      notes: 'system:OWNER_RESPONSE',
    });
    expect(history).not.toBeNull();
    expect(history?.oldStatus).toBe('PENDING');
    expect(history?.newStatus).toBe('EXPIRED');

    // A new booking on the same dates now succeeds
    const renter2 = await createUser();
    const renter2Auth = authHeader(renter2._id.toString());
    const newRes = await request(app)
      .post('/api/v1/rentals')
      .set(renter2Auth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    expect(newRes.status).toBe(201);
  });

  it('expires unpaid orders after 12h', async () => {
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(res).id;

    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);

    // Advance 12h
    clock.advanceHours(12);
    const run = await timerService.runDue();
    expect(run.processed).toBe(1);

    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('EXPIRED');

    // Now try to pay -> 409
    await fund(renterId, 500_000);
    const payRes = await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    expect(payRes.status).toBe(409);
  });

  it('auto-confirms receipt after 48h', async () => {
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(res).id;

    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');

    // Advance 48h
    clock.advanceHours(48);
    const run = await timerService.runDue();
    expect(run.processed).toBe(1);

    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('IN_USE');
    expect(checkOrder?.handover?.autoConfirmed).toBe(true);
    expect(checkOrder?.timer?.kind).toBe('RETURN_REMINDER');
  });

  it('reminds before the end and then daily when overdue', async () => {
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(res).id;

    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');
    await request(app)
      .post(`/api/v1/rentals/${orderId}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');

    // 1. Advance to reminder time: 2026-11-06T17:00:00Z
    clock.set('2026-11-06T17:00:00Z');
    notifier.sent.length = 0;
    const run1 = await timerService.runDue();
    expect(run1.processed).toBe(1);

    let checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('IN_USE');
    expect(checkOrder?.timer).toMatchObject({
      kind: 'OVERDUE',
      dueAt: new Date('2026-11-07T17:00:00.000Z'),
    });
    expect(notifier.sent.some((n: any) => n.userId === renterId)).toBe(true);
    expect(await OrderStatusHistory.countDocuments({ orderId, notes: /remind/i })).toBe(0);

    // 2. Advance to overdue time: 2026-11-07T17:00:00Z
    clock.set('2026-11-07T17:00:00Z');
    notifier.sent.length = 0;
    const run2 = await timerService.runDue();
    expect(run2.processed).toBe(1);

    checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('IN_USE');
    expect(checkOrder?.lastReminderAt).toEqual(new Date('2026-11-07T17:00:00.000Z'));
    // Next dueAt is rescheduled +24h -> 2026-11-08T17:00:00Z
    expect(checkOrder?.timer).toMatchObject({
      kind: 'OVERDUE',
      dueAt: new Date('2026-11-08T17:00:00.000Z'),
    });
    expect(notifier.sent.some((n: any) => n.userId === renterId)).toBe(true);
    expect(notifier.sent.some((n: any) => n.userId === ownerId)).toBe(true);
  });

  it('keeps a same-day booking pending until the end of the start day', async () => {
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-01', endDate: '2026-11-02' });
    expect(res.status).toBe(201);
    expect(unwrap(res).timer).toMatchObject({
      kind: 'OWNER_RESPONSE',
      dueAt: '2026-11-01T17:00:00.000Z',
    });

    const run = await timerService.runDue();
    expect(run.processed).toBe(0);
    expect((await RentalOrder.findById(unwrap(res).id))?.status).toBe('PENDING');
  });

  it('sends one overdue reminder, not a backlog, after a late receipt', async () => {
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-01', endDate: '2026-11-02' });
    const orderId = unwrap(res).id;

    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');

    // Nhận đồ trễ ~6 ngày sau khi hết hạn thuê (hết hạn lúc 2026-11-02T17:00Z)
    clock.set('2026-11-09T03:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${orderId}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');

    notifier.sent.length = 0;
    await timerService.runDue();
    await timerService.runDue();
    await timerService.runDue();

    const titles = notifier.sent.map((n: any) => n.title);
    expect(titles.filter((t: string) => /sắp hết hạn/i.test(t))).toHaveLength(0);
    expect(titles.filter((t: string) => /quá hạn/i.test(t))).toHaveLength(2); // Renter + Owner, một lần

    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.timer?.kind).toBe('OVERDUE');
    expect(checkOrder!.timer!.dueAt.getTime()).toBeGreaterThan(clock.now().getTime());
    expect(checkOrder?.timer?.dueAt).toEqual(new Date('2026-11-09T17:00:00.000Z'));
  });

  it('rejects a late accept even before the scheduler expires the request', async () => {
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(res).id;

    // Đã quá 24h nhưng scheduler chưa chạy
    clock.advanceHours(24);
    const accept = await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    expect(accept.status).toBe(409);
    expect(accept.body.error.code).toBe('INVALID_RENTAL_TRANSITION');
    expect((await RentalOrder.findById(orderId))?.status).toBe('PENDING');

    await timerService.runDue();
    expect((await RentalOrder.findById(orderId))?.status).toBe('EXPIRED');
  });

  it('auto-settles after 72h', async () => {
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = unwrap(res).id;

    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');
    await request(app)
      .post(`/api/v1/rentals/${orderId}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');

    clock.set('2026-11-07T10:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');

    // Advance 72h -> 2026-11-10T10:00:00Z
    clock.advanceHours(72);
    const run = await timerService.runDue();
    expect(run.processed).toBe(1);

    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('COMPLETED');
    expect(checkOrder?.settlement?.result).toBe('GOOD');
    expect(checkOrder?.settlement?.autoSettled).toBe(true);

    const escrowWallet = await ledger.getOrCreateSystemWallet('escrow');
    expect(escrowWallet.balance).toBe(0);
    const ownerWallet = await ledger.getOrCreateUserWallet(ownerId);
    expect(ownerWallet.balance).toBe(135_000);
    expect(await sumBalances()).toBe(0);
  });

  it('one failing order does not stop the batch', async () => {
    // Create 2 pending orders
    const res1 = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId1 = unwrap(res1).id;

    const toy2 = await createRentToy(ownerId);
    const res2 = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId: toy2._id.toString(), startDate: '2026-11-10', endDate: '2026-11-12' });
    const orderId2 = unwrap(res2).id;

    clock.advanceHours(24);

    const errors: any[] = [];
    const mockLogger = {
      error: (...args: any[]) => errors.push(args),
    };

    const originalExpire = rentalService.expire.bind(rentalService);
    rentalService.expire = async (id: string, kind: any) => {
      if (id === orderId1) {
        throw new Error('Database locked');
      }
      return originalExpire(id, kind);
    };

    const customTimer = new RentalTimerService(rentalService, repository, clock, mockLogger);
    const result = await customTimer.runDue();

    expect(result).toEqual({ processed: 1, failed: 1 });
    expect(errors).toHaveLength(1);

    const check1 = await RentalOrder.findById(orderId1);
    const check2 = await RentalOrder.findById(orderId2);
    expect(check1?.status).toBe('PENDING');
    expect(check2?.status).toBe('EXPIRED');
  });

  it('running twice is harmless', async () => {
    const res = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    unwrap(res);

    clock.advanceHours(24);
    const firstRun = await timerService.runDue();
    expect(firstRun.processed).toBe(1);

    const secondRun = await timerService.runDue();
    expect(secondRun.processed).toBe(0);
  });
});

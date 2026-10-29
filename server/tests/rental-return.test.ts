import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RentalOrder } from '../src/models/index.js';
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

describe('UC10: Rental Return with Late Fee', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let photoStorage: any;
  let toyId: string;
  let ownerId: string;
  let renterId: string;
  let renterAuth: any;
  let ownerAuth: any;
  let orderId: string;

  const unwrap = (res: request.Response) => res.body.data;
  const errorOf = (res: request.Response) => res.body.error;

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    // Start at 2026-11-01
    clock = new FakeClock('2026-11-01T03:00:00Z');
    const built = buildRentalApp(clock);
    app = built.app;
    notifier = built.notifier;
    photoStorage = built.photoStorage;

    const owner = await createUser();
    ownerId = owner._id.toString();
    ownerAuth = authHeader(ownerId);

    const renter = await createUser();
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);

    // priceOrRate: 50k, depositPrice: 200k
    const toy = await createRentToy(ownerId);
    toyId = toy._id.toString();

    // 1. Create order 2026-11-05 to 2026-11-07 (3 days: 150k rent + 200k deposit = 350k)
    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-05', endDate: '2026-11-07' });
    orderId = unwrap(created).id;

    // 2. Owner accepts
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);

    // 3. Renter pays
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);

    // 4. Owner ships
    await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');

    // 5. Renter receives -> order is now IN_USE
    await request(app)
      .post(`/api/v1/rentals/${orderId}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');
  });

  it('on-time return has no late fee', async () => {
    // rentalEnd is 2026-11-07T17:00:00Z. Return at 10:00:00Z (on-time)
    clock.set('2026-11-07T10:00:00Z');

    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .field('note', 'Đồ chơi còn rất mới, bé chơi rất thích!')
      .attach('photos', JPEG, 'return1.jpg');

    expect(res.status).toBe(200);
    const data = unwrap(res);
    expect(data.status).toBe('RETURNING');
    expect(data.returnInfo).toMatchObject({
      lateDays: 0,
      lateFee: 0,
      requestedAt: '2026-11-07T10:00:00.000Z',
      note: 'Đồ chơi còn rất mới, bé chơi rất thích!',
    });
    expect(data.returnInfo.photos).toHaveLength(1);
    // Settlement timer is now + 72h -> 2026-11-10T10:00:00.000Z
    expect(data.timer).toEqual({
      kind: 'SETTLEMENT',
      dueAt: '2026-11-10T10:00:00.000Z',
    });

    const ownerNotif = notifier.sent.find(
      (n: any) => n.userId === ownerId && n.title.includes('trả đồ chơi'),
    );
    expect(ownerNotif).toBeDefined();
    expect(ownerNotif.body).not.toContain('Phí trả trễ');
  });

  it('late return charges rounded-up days', async () => {
    // rentalEnd is 2026-11-07T17:00:00Z.
    // 2026-11-09T03:00:00Z is 34 hours past end -> ceil(34/24) = 2 days late
    // 2 days * 50_000 = 100_000
    clock.set('2026-11-09T03:00:00Z');

    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');

    expect(res.status).toBe(200);
    const data = unwrap(res);
    expect(data.status).toBe('RETURNING');
    expect(data.returnInfo).toMatchObject({
      lateDays: 2,
      lateFee: 100_000,
      requestedAt: '2026-11-09T03:00:00.000Z',
    });

    const ownerNotif = notifier.sent.find(
      (n: any) => n.userId === ownerId && n.title.includes('trả đồ chơi'),
    );
    expect(ownerNotif).toBeDefined();
    expect(ownerNotif.body).toContain('100.000');
  });

  it('late fee never exceeds the deposit', async () => {
    // 2026-11-12T03:00:00Z is > 4 days late (5 days * 50k = 250k > deposit 200k)
    clock.set('2026-11-12T03:00:00Z');

    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');

    expect(res.status).toBe(200);
    const data = unwrap(res);
    expect(data.returnInfo.lateDays).toBe(5);
    expect(data.returnInfo.lateFee).toBe(200_000); // capped at deposit
  });

  it('note over 500 chars is rejected', async () => {
    const longNote = 'a'.repeat(501);
    const uploadedBefore = photoStorage.uploaded.length;

    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .field('note', longNote)
      .attach('photos', JPEG, 'return.jpg');

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_ERROR');

    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('IN_USE');
    // Ghi chú sai bị chặn trước khi upload
    expect(photoStorage.uploaded).toHaveLength(uploadedBefore);
  });

  it('only the renter can return and only from IN_USE', async () => {
    // Owner tries to return -> 403
    const ownerRes = await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'return.jpg');

    expect(ownerRes.status).toBe(403);
    expect(errorOf(ownerRes).code).toBe('FORBIDDEN_RENTAL_ACTION');

    // Renter returns successfully
    const firstReturn = await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');
    expect(firstReturn.status).toBe(200);

    // Second return -> 409
    const secondReturn = await request(app)
      .post(`/api/v1/rentals/${orderId}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return2.jpg');
    expect(secondReturn.status).toBe(409);
    expect(errorOf(secondReturn).code).toBe('INVALID_RENTAL_TRANSITION');
  });
});

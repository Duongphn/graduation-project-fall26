import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderStatusHistory, RentalOrder } from '../src/models/index.js';
import { SYSTEM_ACTOR_ID } from '../src/constants/rental-order-status.js';
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

describe('UC09: Rental Handover (Ship and Receive)', () => {
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

    const toy = await createRentToy(ownerId);
    toyId = toy._id.toString();

    // 1. Create order: 2026-11-05 to 2026-11-07
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
  });

  it('owner ships with photos', async () => {
    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'photo1.jpg')
      .attach('photos', JPEG, 'photo2.jpg');

    expect(res.status).toBe(200);
    const data = unwrap(res);
    expect(data.status).toBe('SHIPPING');
    expect(data.handover?.ownerPhotos).toHaveLength(2);
    expect(data.handover?.ownerPhotos[0]?.url).toBeDefined();
    expect(data.handover?.shippedAt).toBe('2026-11-01T03:00:00.000Z');
    expect(data.timer).toEqual({
      kind: 'RECEIPT_CONFIRM',
      dueAt: '2026-11-03T03:00:00.000Z', // 48h after ship
    });

    const renterNotif = notifier.sent.find(
      (n: any) => n.userId === renterId && n.title.includes('giao'),
    );
    expect(renterNotif).toBeDefined();
    expect(renterNotif.body).toContain('2');
  });

  it('ship requires 1–10 valid photos', async () => {
    // 0 photos
    const noPhotos = await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth);
    expect(noPhotos.status).toBe(400);

    // 11 photos
    let req11 = request(app).post(`/api/v1/rentals/${orderId}/ship`).set(ownerAuth);
    for (let i = 0; i < 11; i++) {
      req11 = req11.attach('photos', JPEG, `p${i}.jpg`);
    }
    const res11 = await req11;
    expect(res11.status).toBe(400);
    expect(errorOf(res11).code).toBe('INVALID_IMAGE_UPLOAD');

    // Text file
    const textFile = await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', Buffer.from('not an image'), 'invalid.txt');
    expect(textFile.status).toBe(400);

    // Order status stays PAID
    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('PAID');
  });

  it('renter confirms receipt and the rental starts', async () => {
    // Owner ships first
    await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'photo1.jpg');

    // Advance clock 2 hours
    clock.advanceHours(2); // 2026-11-01T05:00:00Z

    // Renter confirms receipt
    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive1.jpg');

    expect(res.status).toBe(200);
    const data = unwrap(res);
    expect(data.status).toBe('IN_USE');
    expect(data.rentalStartedAt).toBe('2026-11-01T05:00:00.000Z');
    expect(data.handover?.renterPhotos).toHaveLength(1);
    expect(data.handover?.receivedAt).toBe('2026-11-01T05:00:00.000Z');
    expect(data.handover?.autoConfirmed).toBe(false);

    // endDate is 2026-11-07 -> rentalEnd is 2026-11-07T17:00:00Z -> returnReminder is 24h before -> 2026-11-06T17:00:00Z
    expect(data.timer).toEqual({
      kind: 'RETURN_REMINDER',
      dueAt: '2026-11-06T17:00:00.000Z',
    });

    const ownerNotif = notifier.sent.find(
      (n: any) => n.userId === ownerId && n.title.includes('nhận'),
    );
    expect(ownerNotif).toBeDefined();
  });

  it('wrong role uploads nothing', async () => {
    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(renterAuth) // renter cannot ship
      .attach('photos', JPEG, 'photo1.jpg');

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN_RENTAL_ACTION');
    expect(photoStorage.uploaded).toHaveLength(0);
  });

  it('rejects a wrong-status action before uploading anything', async () => {
    // Đơn đang PAID: chưa giao nên chưa thể xác nhận nhận đồ
    const res = await request(app)
      .post(`/api/v1/rentals/${orderId}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');
    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe('INVALID_RENTAL_TRANSITION');
    expect(photoStorage.uploaded).toHaveLength(0);
  });

  it('photos are cleaned up when the transition fails', async () => {
    // Hai lần giao gửi cùng lúc đều qua bước kiểm tra trước, chỉ một bên thắng trong transaction
    const results = await Promise.all(
      ['photo1.jpg', 'photo2.jpg'].map((name) =>
        request(app).post(`/api/v1/rentals/${orderId}/ship`).set(ownerAuth).attach('photos', JPEG, name),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(photoStorage.uploaded).toHaveLength(2);

    // Ảnh của bên thua bị xoá, đơn chỉ giữ ảnh của bên thắng
    const checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.handover?.ownerPhotos).toHaveLength(1);
    const keptId = checkOrder?.handover?.ownerPhotos[0]?.publicId;
    const loserId = photoStorage.uploaded.find((id: string) => id !== keptId);
    expect(photoStorage.deleted).toEqual([loserId]);
  });

  it('autoConfirmReceipt only fires when due', async () => {
    // Ship
    await request(app)
      .post(`/api/v1/rentals/${orderId}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'photo1.jpg');

    // Hàm do scheduler gọi nằm ở RentalSystemService
    const container = (app as any).locals?.container;
    const service = container.rentalSystemService;

    // Advance clock 24h (not yet 48h)
    clock.advanceHours(24);
    await service.autoConfirmReceipt(orderId);

    // Status still SHIPPING
    let checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('SHIPPING');

    // Advance clock another 24h (total 48h reached)
    clock.advanceHours(24);
    await service.autoConfirmReceipt(orderId);

    checkOrder = await RentalOrder.findById(orderId);
    expect(checkOrder?.status).toBe('IN_USE');
    expect(checkOrder?.handover?.autoConfirmed).toBe(true);

    const history = await OrderStatusHistory.findOne({
      orderId,
      notes: 'system:RECEIPT_CONFIRM',
    });
    expect(history).not.toBeNull();
    expect(history?.changedBy.toString()).toBe(SYSTEM_ACTOR_ID);

    expect(notifier.sent.some((n: any) => n.userId === renterId)).toBe(true);
    expect(notifier.sent.some((n: any) => n.userId === ownerId)).toBe(true);
  });
});

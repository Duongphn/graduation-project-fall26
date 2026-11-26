import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Dispute, RentalOrder } from '../src/models/index.js';
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
const COMPLAINT = 'Hộp bị móp, bánh xe trước bị gãy ngay khi mở ra.';
const REPLY = 'Lúc giao đồ còn nguyên, có ảnh chụp khi đóng gói gửi kèm.';
const DECISION = 'Ảnh lúc giao đã thấy vết nứt ở bánh trước, lỗi thuộc về chủ đồ chơi.';

describe('UC17–UC18: renter complaint and the reply of the other party', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let ownerId: string;
  let renterId: string;
  let ownerAuth: any;
  let renterAuth: any;
  let adminAuth: any;

  /** Đơn 05–07/11 (R = 150k, D = 200k), người thuê nhận đồ lúc 05/11 10:00 */
  const inUseOrder = async () => {
    clock.set('2026-11-01T03:00:00Z');
    const toy = await createRentToy(ownerId);
    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId: toy._id.toString(), startDate: '2026-11-05', endDate: '2026-11-07' });
    const orderId = created.body.data.id as string;
    await request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${orderId}/pay`).set(renterAuth);
    await request(app).post(`/api/v1/rentals/${orderId}/ship`).set(ownerAuth).attach('photos', JPEG, 's.jpg');
    clock.set('2026-11-05T10:00:00Z');
    await request(app).post(`/api/v1/rentals/${orderId}/receive`).set(renterAuth).attach('photos', JPEG, 'r.jpg');
    return orderId;
  };

  const complain = (orderId: string, fields: Record<string, string> = {}, photos = 1) => {
    let req = request(app)
      .post(`/api/v1/rentals/${orderId}/complaints`)
      .set(renterAuth)
      .field('reason', fields.reason ?? 'DAMAGED_ON_RECEIPT')
      .field('description', fields.description ?? COMPLAINT);
    for (let i = 0; i < photos; i += 1) req = req.attach('photos', JPEG, `e${i}.jpg`);
    return req;
  };

  const reply = (orderId: string, auth: any, message = REPLY) =>
    request(app).post(`/api/v1/rentals/${orderId}/dispute/response`).set(auth).field('message', message);

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
    ownerId = (await createUser({ fullName: 'Chủ Đồ' }))._id.toString();
    renterId = (await createUser({ fullName: 'Người Thuê' }))._id.toString();
    const adminId = (await createUser({ role: 'ADMIN' }))._id.toString();
    ownerAuth = authHeader(ownerId);
    renterAuth = authHeader(renterId);
    adminAuth = authHeader(adminId, 'ADMIN');
  });

  it('opens a complaint within 24 hours of receipt: the order is disputed and the owner has 72 hours', async () => {
    const orderId = await inUseOrder();
    clock.set('2026-11-05T20:00:00Z');

    const res = await complain(orderId);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DISPUTING');
    expect(res.body.data.timer).toBeUndefined();

    const dispute = await Dispute.findOne({ orderId });
    expect(dispute?.claimantId.toString()).toBe(renterId);
    expect(dispute?.respondentId.toString()).toBe(ownerId);
    expect(dispute?.evidencePhotos).toHaveLength(1);
    expect(dispute?.timer?.dueAt?.toISOString()).toBe('2026-11-08T20:00:00.000Z');
    expect(notifier.sent.some((n: any) => n.userId === ownerId && n.type === 'DISPUTE')).toBe(true);
  });

  it('refuses a complaint after 24 hours, without photos, or from the owner', async () => {
    const orderId = await inUseOrder();
    expect((await complain(orderId, {}, 0)).body.error.code).toBe('INVALID_IMAGE_UPLOAD');
    expect((await complain(orderId, { description: 'ngắn' })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await complain(orderId, { reason: 'DAMAGED_ON_RETURN' })).body.error.code).toBe('VALIDATION_ERROR');

    const asOwner = await request(app)
      .post(`/api/v1/rentals/${orderId}/complaints`)
      .set(ownerAuth)
      .field('reason', 'OTHER')
      .field('description', COMPLAINT)
      .attach('photos', JPEG, 'e.jpg');
    expect(asOwner.status).toBe(403);

    clock.set('2026-11-06T10:00:01Z');
    const late = await complain(orderId);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('COMPLAINT_WINDOW_CLOSED');
    expect((await RentalOrder.findById(orderId))?.status).toBe('IN_USE');
  });

  it('shows the complaint to both parties, and only the respondent may reply, once', async () => {
    const orderId = await inUseOrder();
    await complain(orderId);

    const seenByOwner = await request(app).get(`/api/v1/rentals/${orderId}/dispute`).set(ownerAuth);
    expect(seenByOwner.body.data).toMatchObject({
      claimant: 'renter',
      viewerRole: 'respondent',
      reason: 'DAMAGED_ON_RECEIPT',
      canRespond: true,
    });
    const seenByRenter = await request(app).get(`/api/v1/rentals/${orderId}/dispute`).set(renterAuth);
    expect(seenByRenter.body.data).toMatchObject({ viewerRole: 'claimant', canRespond: false });

    expect((await reply(orderId, renterAuth)).status).toBe(403);
    expect((await reply(orderId, ownerAuth, 'ngắn')).body.error.code).toBe('VALIDATION_ERROR');

    const answered = await reply(orderId, ownerAuth);
    expect(answered.status).toBe(200);
    expect(answered.body.data).toMatchObject({
      status: 'under_review',
      canRespond: false,
      response: { message: REPLY, photos: [] },
    });
    expect((await reply(orderId, ownerAuth)).body.error.code).toBe('DISPUTE_ALREADY_ANSWERED');
    expect(notifier.sent.some((n: any) => n.userId === renterId && n.title.includes('phản hồi'))).toBe(true);
  });

  it('refuses a reply after the 72-hour deadline', async () => {
    const orderId = await inUseOrder();
    await complain(orderId);
    clock.advanceHours(72);
    const res = await reply(orderId, ownerAuth);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DISPUTE_REPLY_CLOSED');
  });

  it('lets the Admin rule as soon as the respondent replied, and refunds rent to the renter', async () => {
    const orderId = await inUseOrder();
    await complain(orderId);
    const disputeId = (await Dispute.findOne({ orderId }))!._id.toString();
    const resolve = () =>
      request(app)
        .post(`/api/v1/admin/disputes/${disputeId}/resolve`)
        .set(adminAuth)
        .send({ ruling: 'OWNER_AT_FAULT', compensationRate: 100, adminDecision: DECISION });

    // Chưa phản hồi và còn hạn: chưa phán quyết được
    expect((await resolve()).body.error.code).toBe('DISPUTE_REPLY_PENDING');

    await reply(orderId, ownerAuth);
    const caseFile = await request(app).get(`/api/v1/admin/disputes/${disputeId}`).set(adminAuth);
    expect(caseFile.body.data.evidencePhotos).toHaveLength(1);
    expect(caseFile.body.data.response.message).toBe(REPLY);

    const ruled = await resolve();
    expect(ruled.status).toBe(200);
    // Chủ đồ có lỗi, hoàn 100% tiền thuê: người thuê nhận lại R + D
    expect(ruled.body.data.resolution).toMatchObject({ rentRefundAmount: 150_000, renterAmount: 350_000 });

    const order = await request(app).get(`/api/v1/rentals/${orderId}`).set(renterAuth);
    expect(order.body.data.status).toBe('COMPLETED');
    expect(order.body.data.settlement.resolution).toMatchObject({ ruling: 'OWNER_AT_FAULT' });
  });
});

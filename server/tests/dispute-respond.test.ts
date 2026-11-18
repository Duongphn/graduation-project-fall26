import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Dispute } from '../src/models/index.js';
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
const VALID_DESCRIPTION = 'Đồ chơi bị nứt phần thân ngay khi mở hộp.';
const VALID_MESSAGE = 'Đồ chơi còn nguyên vẹn khi giao, có ảnh đối chiếu.';

describe('UC18: respond to a dispute', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let photoStorage: any;
  let ownerId: string;
  let renterId: string;
  let adminId: string;
  let renterAuth: any;
  let ownerAuth: any;
  let orderId: string;
  let disputeId: string;

  const unwrap = (res: request.Response) => res.body.data;
  const errorOf = (res: request.Response) => res.body.error;
  const service = () => (app as any).locals.container.disputeService;

  const respond = (auth: any, message: string = VALID_MESSAGE, photos = 1, id = disputeId) => {
    let req = request(app).post(`/api/v1/disputes/${id}/response`).set(auth).field('message', message);
    for (let i = 0; i < photos; i += 1) {
      req = req.attach('photos', JPEG, `response-${i}.jpg`);
    }
    return req;
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

    const owner = await createUser();
    ownerId = owner._id.toString();
    ownerAuth = authHeader(ownerId);
    const renter = await createUser();
    renterId = renter._id.toString();
    renterAuth = authHeader(renterId);
    adminId = (await createUser({ role: 'ADMIN' }))._id.toString();

    const toy = await createRentToy(ownerId);
    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId: toy._id.toString(), startDate: '2026-11-05', endDate: '2026-11-07' });
    orderId = unwrap(created).id;
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

    clock.advanceHours(1);
    const opened = await request(app)
      .post(`/api/v1/rentals/${orderId}/disputes`)
      .set(renterAuth)
      .field('reason', 'DAMAGED_ON_RECEIPT')
      .field('description', VALID_DESCRIPTION)
      .attach('photos', JPEG, 'evidence.jpg');
    expect(opened.status).toBe(201);
    disputeId = unwrap(opened).dispute.id;
    notifier.sent.length = 0;
  });

  it('lets the owner answer within 72 hours', async () => {
    const res = await respond(ownerAuth);

    expect(res.status).toBe(200);
    const dispute = unwrap(res);
    expect(dispute.status).toBe('under_review');
    expect(dispute.response.photos).toHaveLength(1);
    expect(dispute.response.message).toBe(VALID_MESSAGE);
    expect(dispute.reviewStartedAt).toBeDefined();
    expect(dispute.responseDueAt).toBeUndefined();
    expect(notifier.sent.some((n: any) => n.userId === renterId)).toBe(true);
    expect(notifier.sent.some((n: any) => n.userId === adminId)).toBe(true);

    const stored = await Dispute.findById(disputeId).lean();
    expect(stored?.timer).toBeUndefined();
  });

  it('accepts an answer without photos', async () => {
    const res = await respond(ownerAuth, VALID_MESSAGE, 0);
    expect(res.status).toBe(200);
    expect(unwrap(res).response.photos).toHaveLength(0);
  });

  it('checks the message length', async () => {
    const short = await respond(ownerAuth, '123456789');
    expect(short.status).toBe(400);
    expect(errorOf(short).code).toBe('VALIDATION_ERROR');
    const long = await respond(ownerAuth, 'x'.repeat(1001));
    expect(long.status).toBe(400);
    expect(errorOf(long).code).toBe('VALIDATION_ERROR');
    expect((await Dispute.findById(disputeId))?.status).toBe('open');
  });

  it('answers only once', async () => {
    expect((await respond(ownerAuth)).status).toBe(200);
    const second = await respond(ownerAuth);
    expect(second.status).toBe(409);
    expect(errorOf(second).code).toBe('DISPUTE_NOT_OPEN');
  });

  it('refuses an answer after 72 hours', async () => {
    clock.advanceHours(72);
    const kept = photoStorage.uploaded.length - photoStorage.deleted.length;

    const res = await respond(ownerAuth);

    expect(res.status).toBe(400);
    expect(errorOf(res).code).toBe('RESPONSE_WINDOW_CLOSED');
    expect(photoStorage.uploaded.length - photoStorage.deleted.length).toBe(kept);
    expect((await Dispute.findById(disputeId))?.status).toBe('open');
  });

  it('does not let the claimant answer', async () => {
    const res = await respond(renterAuth);
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN_RENTAL_ACTION');
  });

  it('moves a dispute nobody answered to review', async () => {
    clock.advanceHours(72);
    notifier.sent.length = 0;

    expect(await service().expireResponses()).toEqual({ moved: 1 });

    const stored = await Dispute.findById(disputeId).lean();
    expect(stored?.status).toBe('under_review');
    expect(stored?.responseMissed).toBe(true);
    expect(stored?.reviewStartedAt).toBeDefined();
    expect(stored?.timer).toBeUndefined();
    for (const id of [renterId, ownerId, adminId]) {
      expect(notifier.sent.some((n: any) => n.userId === id)).toBe(true);
    }

    expect(await service().expireResponses()).toEqual({ moved: 0 });
  });

  it('answer and expiry race', async () => {
    const before = await Dispute.findById(disputeId);
    clock.set(new Date(before!.timer!.dueAt!.getTime() - 1));

    const [res, expired] = await Promise.all([respond(ownerAuth), service().expireResponses()]);

    const stored = await Dispute.findById(disputeId).lean();
    expect(stored?.status).toBe('under_review');
    if (res.status === 200) {
      expect(expired.moved).toBe(0);
      expect(stored?.response?.message).toBe(VALID_MESSAGE);
      expect(stored?.responseMissed).not.toBe(true);
    } else {
      expect(expired.moved).toBe(1);
      expect(stored?.responseMissed).toBe(true);
    }
  });

  it('shows a dispute only to its parties', async () => {
    const stranger = authHeader((await createUser())._id.toString());

    const get = await request(app).get(`/api/v1/disputes/${disputeId}`).set(stranger);
    expect(get.status).toBe(404);
    expect(errorOf(get).code).toBe('DISPUTE_NOT_FOUND');
    const post = await respond(stranger);
    expect(post.status).toBe(404);
    expect(errorOf(post).code).toBe('DISPUTE_NOT_FOUND');

    for (const auth of [renterAuth, ownerAuth]) {
      const ok = await request(app).get(`/api/v1/disputes/${disputeId}`).set(auth);
      expect(ok.status).toBe(200);
      expect(unwrap(ok).id).toBe(disputeId);
    }

    const mine = await request(app).get('/api/v1/disputes?role=respondent').set(ownerAuth);
    expect(mine.status).toBe(200);
    expect(unwrap(mine).items).toHaveLength(1);
    expect(unwrap(mine).total).toBe(1);

    const asClaimant = await request(app).get('/api/v1/disputes?role=respondent').set(renterAuth);
    expect(unwrap(asClaimant).items).toHaveLength(0);

    const byStatus = await request(app).get('/api/v1/disputes?status=resolved').set(ownerAuth);
    expect(unwrap(byStatus).items).toHaveLength(0);

    const bad = await request(app).get('/api/v1/disputes?role=admin').set(ownerAuth);
    expect(bad.status).toBe(400);
  });
});

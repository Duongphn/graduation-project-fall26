import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RentalOrder, Review, Toy, User } from '../src/models/index.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
  fund,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';
import { createCompletedRental } from './helpers/review-fixtures.js';

const SETTLED_AT = new Date('2026-11-01T03:00:00Z');
const DAY = 86_400_000;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe('UC24: submit and view rental reviews', () => {
  let app: any;
  let clock: FakeClock;
  let notifier: any;
  let ownerId: string;
  let renterId: string;
  let ownerAuth: any;
  let renterAuth: any;
  let toyId: string;
  let orderId: string;

  const post = (id: string, auth: any, body: unknown) =>
    request(app).post(`/api/v1/rentals/${id}/reviews`).set(auth).send(body as object);
  const get = (id: string, auth: any) =>
    request(app).get(`/api/v1/rentals/${id}/reviews`).set(auth);
  const completed = async () =>
    String(
      (await createCompletedRental({ renterId, ownerId, toyId, settledAt: SETTLED_AT }))._id,
    );

  beforeAll(async () => {
    await startReplSet();
  });
  afterAll(async () => {
    await stopReplSet();
  });
  beforeEach(async () => {
    await resetDatabase();
    clock = new FakeClock('2026-11-02T03:00:00Z');
    const built = buildRentalApp(clock);
    app = built.app;
    notifier = built.notifier;
    ownerId = String((await createUser())._id);
    renterId = String((await createUser())._id);
    ownerAuth = authHeader(ownerId);
    renterAuth = authHeader(renterId);
    toyId = String((await createRentToy(ownerId))._id);
    orderId = await completed();
  });

  it('renter reviews owner and toy', async () => {
    const res = await post(orderId, renterAuth, {
      userRating: 5,
      toyRating: 4,
      comment: 'Đồ chơi sạch, giao đúng hẹn',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.direction).toBe('RENTER_TO_OWNER');
    expect(res.body.data.reviewer.id).toBe(renterId);
    expect(res.body.data.reviewer.phone).toBeUndefined();
    expect(res.body.data.reviewer.email).toBeUndefined();
    const toy = await Toy.findById(toyId);
    expect(toy?.rating).toMatchObject({ sum: 4, count: 1 });
    const owner = await User.findById(ownerId);
    expect(owner?.trust?.reviewCount).toBe(1);
    expect(owner?.trust?.score).toBeNull();
    const sent = notifier.sent.filter((n: any) => n.userId === ownerId);
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe('Bạn có đánh giá mới');
  });

  it('owner reviews renter without toyRating', async () => {
    const res = await post(orderId, ownerAuth, { userRating: 3 });
    expect(res.status).toBe(201);
    expect(res.body.data.direction).toBe('OWNER_TO_RENTER');
    const toy = await Toy.findById(toyId);
    expect(toy?.rating?.count ?? 0).toBe(0);
  });

  it('rejects toyRating from owner and missing toyRating from renter', async () => {
    const a = await post(orderId, ownerAuth, { userRating: 3, toyRating: 4 });
    expect(a.status).toBe(400);
    expect(a.body.error.code).toBe('VALIDATION_ERROR');
    const b = await post(orderId, renterAuth, { userRating: 3 });
    expect(b.status).toBe(400);
    expect(b.body.error.code).toBe('VALIDATION_ERROR');
  });

  it("rejects ratings 0, 6, 4.5 and '5'", async () => {
    for (const bad of [0, 6, 4.5, '5']) {
      const res = await post(orderId, ownerAuth, { userRating: bad });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects comments with phone, email or link', async () => {
    for (const comment of ['Gọi 0912 345 678', 'mail a@b.com', 'xem https://shop.vn']) {
      const res = await post(orderId, ownerAuth, { userRating: 4, comment });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CONTACT_DETAILS_NOT_ALLOWED');
    }
    expect(await Review.countDocuments()).toBe(0);
  });

  it('rejects comment longer than 1000 chars', async () => {
    const res = await post(orderId, ownerAuth, { userRating: 4, comment: 'a'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('stores a whitespace-only comment as no comment', async () => {
    const res = await post(orderId, ownerAuth, { userRating: 4, comment: '   ' });
    expect(res.status).toBe(201);
    expect(res.body.data.comment).toBeUndefined();
    expect((await Review.findOne())?.comment).toBeUndefined();
  });

  it('rejects orders not completed', async () => {
    await RentalOrder.updateOne({ _id: orderId }, { status: 'RETURNED' });
    const res = await post(orderId, ownerAuth, { userRating: 4 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_NOT_COMPLETED');
  });

  it('checks order status before the toyRating rule', async () => {
    await RentalOrder.updateOne({ _id: orderId }, { status: 'RETURNED' });
    const res = await post(orderId, renterAuth, { userRating: 4 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_NOT_COMPLETED');
  });

  it('window is inclusive at 14 days', async () => {
    clock.set(new Date(SETTLED_AT.getTime() + 14 * DAY));
    const ok = await post(orderId, ownerAuth, { userRating: 4 });
    expect(ok.status).toBe(201);

    const other = await completed();
    clock.set(new Date(SETTLED_AT.getTime() + 14 * DAY + 1));
    const late = await post(other, ownerAuth, { userRating: 4 });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('REVIEW_WINDOW_CLOSED');
  });

  it('rejects a second review and concurrent duplicates', async () => {
    const first = await post(orderId, renterAuth, { userRating: 5, toyRating: 5 });
    expect(first.status).toBe(201);
    const second = await post(orderId, renterAuth, { userRating: 5, toyRating: 5 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_REVIEWED');

    const other = await completed();
    const results = await Promise.all([
      post(other, renterAuth, { userRating: 4, toyRating: 4 }),
      post(other, renterAuth, { userRating: 4, toyRating: 4 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const toy = await Toy.findById(toyId);
    expect(toy?.rating?.count).toBe(2); // one from `first`, one from the winning concurrent call
  });

  it('hides the order from outsiders', async () => {
    const stranger = authHeader(String((await createUser())._id));
    const res = await post(orderId, stranger, { userRating: 4 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RENTAL_NOT_FOUND');
    const bad = await post('not-an-id', stranger, { userRating: 4 });
    expect(bad.status).toBe(404);
    expect((await get(orderId, stranger)).status).toBe(404);
  });

  it('reviews an order completed by a dispute verdict', async () => {
    clock.set('2026-11-01T03:00:00Z');
    const toy = await createRentToy(ownerId);
    const created = await request(app)
      .post('/api/v1/rentals')
      .set(renterAuth)
      .send({ toyId: String(toy._id), startDate: '2026-11-05', endDate: '2026-11-06' });
    const id = created.body.data.id;
    await request(app).post(`/api/v1/rentals/${id}/accept`).set(ownerAuth);
    await fund(renterId, 500_000);
    await request(app).post(`/api/v1/rentals/${id}/pay`).set(renterAuth);
    clock.set('2026-11-04T03:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${id}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');
    clock.set('2026-11-05T03:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${id}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');
    clock.set('2026-11-06T10:00:00Z');
    await request(app)
      .post(`/api/v1/rentals/${id}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');
    clock.advanceHours(1);
    const dispute = await request(app)
      .post(`/api/v1/rentals/${id}/disputes`)
      .set(ownerAuth)
      .field('reason', 'DAMAGED_ON_RETURN')
      .field('description', 'Đồ chơi bị nứt phần thân, thiếu một bánh xe.')
      .attach('photos', JPEG, 'evidence.jpg');
    const disputeId = dispute.body.data.dispute.id;
    await request(app)
      .post(`/api/v1/disputes/${disputeId}/response`)
      .set(renterAuth)
      .field('message', 'Đồ chơi còn nguyên vẹn khi trả, có ảnh đối chiếu.');
    const adminAuth = authHeader(String((await createUser({ role: 'ADMIN' }))._id), 'ADMIN');
    const resolved = await request(app)
      .post(`/api/v1/admin/disputes/${disputeId}/resolve`)
      .set(adminAuth)
      .send({
        verdict: 'PARTIAL',
        compensation: 50_000,
        reason: 'Ảnh lúc giao và lúc trả cho thấy vết nứt mới xuất hiện sau khi thuê.',
      });
    expect(resolved.status).toBe(200);

    const res = await post(id, renterAuth, { userRating: 4, toyRating: 4 });
    expect(res.status).toBe(201);
  });

  it('reviews after the toy was hidden', async () => {
    await Toy.updateOne({ _id: toyId }, { status: 'hidden' });
    const res = await post(orderId, renterAuth, { userRating: 5, toyRating: 5 });
    expect(res.status).toBe(201);
    expect((await Toy.findById(toyId))?.rating?.count).toBe(1);
  });

  it('GET shows my and their review with deadline', async () => {
    await post(orderId, renterAuth, { userRating: 5, toyRating: 4 });
    const mine = await get(orderId, renterAuth);
    expect(mine.status).toBe(200);
    expect(mine.body.data.canReview).toBe(false);
    expect(mine.body.data.myReview.userRating).toBe(5);
    expect(mine.body.data.theirReview).toBeNull();
    expect(mine.body.data.reviewDeadline).toBe('2026-11-15T03:00:00.000Z');

    const theirs = await get(orderId, ownerAuth);
    expect(theirs.body.data.canReview).toBe(true);
    expect(theirs.body.data.theirReview.userRating).toBe(5);
    expect(theirs.body.data.myReview).toBeNull();
  });
});

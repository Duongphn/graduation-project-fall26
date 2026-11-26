import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditLog, Notification, RefreshToken, RentalOrder, SystemSetting, Toy, User } from '../../src/models/index.js';
import { subscribeNotifications } from '../../src/services/notification.subscriptions.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
} from '../helpers/rental-fixtures.js';
import { useTestDatabase } from '../support/test-database.js';

useTestDatabase();

// UC29 (FE-09), R03 screen 47: the Admin reviews Renters blocked by a low Trust Score and lifts
// the block, keeps it or locks the account. Driven through the real app (JWT, routes, booking).

const emails: Array<{ to: string; subject: string }> = [];
let unsubscribe: () => void = () => undefined;
beforeAll(() => {
  unsubscribe = subscribeNotifications({
    mailer: {
      send: (message: { to: string; subject: string }) => {
        emails.push(message);
        return Promise.resolve({ delivered: true });
      },
    },
  } as never);
});
afterAll(() => unsubscribe());

const DAY_MS = 86_400_000;
const TODAY_VN = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const day = (offset: number) =>
  new Date(Date.parse(`${TODAY_VN}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
const MSG28 = 'Điểm tin cậy của bạn quá thấp để thuê đồ chơi này.';
const LIFT_REASON = 'Đã gọi điện xác minh, người thuê có lịch sử trả đồ tốt.';
const KEEP_REASON = 'Điểm tin cậy còn thấp do hai lần trả đồ trễ gần đây.';
const LOCK_REASON = 'Nhiều lần cố thuê đồ cọc cao sau khi đã bị từ chối.';
const BASE = '/api/v1/admin/users';

let app: ReturnType<typeof buildRentalApp>['app'];
let adminId: string;
let ownerId: string;
let highToyId: string;
let lowToyId: string;
let renterId: string;

const asAdmin = () => authHeader(adminId, 'ADMIN');
const book = (userId: string, toyId: string, offset = 4) =>
  request(app)
    .post('/api/v1/rentals')
    .set(authHeader(userId))
    .send({ toyId, startDate: day(offset), endDate: day(offset + 2) });
const decide = (action: 'lift' | 'keep' | 'lock', body: object, userId = renterId) =>
  request(app).post(`${BASE}/${userId}/trust-block/${action}`).set(asAdmin()).send(body);
const detail = async (userId = renterId) =>
  (await request(app).get(`${BASE}/${userId}`).set(asAdmin())).body.data;
const counts = async () => (await request(app).get(`${BASE}/counts`).set(asAdmin())).body.data;

beforeEach(async () => {
  await Promise.all(
    [User, Toy, RentalOrder, SystemSetting, AuditLog, Notification, RefreshToken].map((model) =>
      model.collection.deleteMany({}),
    ),
  );
  emails.length = 0;
  app = buildRentalApp(new FakeClock(`${day(0)}T03:00:00Z`)).app;
  adminId = String((await createUser({ role: 'ADMIN', fullName: 'Quản trị viên', trust: {} }))._id);
  ownerId = String((await createUser({ fullName: 'Chủ đồ' }))._id);
  highToyId = String((await createRentToy(ownerId, { depositPrice: 800_000, title: 'Xe điều khiển cọc cao' }))._id);
  lowToyId = String((await createRentToy(ownerId, { depositPrice: 200_000 }))._id);
  renterId = String((await createUser({ fullName: 'Người Thuê Điểm Thấp', trust: { score: 35 } }))._id);
});

describe('the review list (UC29, R03 III.7.2.1)', () => {
  it('puts a refused Renter in the "trust_review" tab with a counter and a list badge', async () => {
    expect((await counts()).trust_review).toBe(0);
    expect((await book(renterId, highToyId)).body.error.message).toBe(MSG28);
    // A low-deposit toy is still allowed and does not change the review.
    expect((await book(renterId, lowToyId)).status).toBe(201);

    expect(await counts()).toMatchObject({ all: 3, trust_review: 1 });
    const tab = await request(app).get(`${BASE}?tab=trust_review`).set(asAdmin());
    expect(tab.status).toBe(200);
    expect(tab.body.data.map((row: { id: string }) => row.id)).toEqual([renterId]);
    expect(tab.body.data[0]).toMatchObject({ trustScore: 35, trustBlockStatus: 'review' });
    // The tab combines with the Trust Score band and the search.
    expect((await request(app).get(`${BASE}?tab=trust_review&trustBand=low`).set(asAdmin())).body.data).toHaveLength(1);
    expect((await request(app).get(`${BASE}?tab=trust_review&trustBand=full`).set(asAdmin())).body.data).toHaveLength(0);
    expect((await request(app).get(`${BASE}/counts?q=${encodeURIComponent('  người thuê ')}`).set(asAdmin())).body.data.trust_review).toBe(1);
    expect((await request(app).get(`${BASE}?tab=TRUST_REVIEW`).set(asAdmin())).status).toBe(400);
  });

  it('shows the review on the account detail', async () => {
    await book(renterId, highToyId);
    await book(renterId, highToyId, 8);
    const view = (await detail()).trustBlock;
    expect(view).toMatchObject({
      threshold: 50,
      depositLimit: 500_000,
      blocked: true,
      lift: null,
      lastDecision: null,
      review: {
        attemptCount: 1,
        toy: { id: highToyId, title: 'Xe điều khiển cọc cao' },
        depositPrice: 800_000,
        score: 35,
        threshold: 50,
        depositLimit: 500_000,
      },
    });
    expect(view.review.requestedAt).toBe(`${day(0)}T03:00:00.000Z`);
    // An account with a full score: no block, no review.
    expect((await detail(ownerId)).trustBlock).toMatchObject({ blocked: false, review: null });
  });
});

describe('Admin decisions', () => {
  it('lift: the same booking then succeeds, with an audit row and a notification', async () => {
    await book(renterId, highToyId);
    const res = await decide('lift', { reason: `  ${LIFT_REASON}  ` });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: renterId, decision: 'lift', accountStatus: 'ACTIVE' });

    expect((await book(renterId, highToyId)).status).toBe(201);
    expect((await counts()).trust_review).toBe(0);
    const view = (await detail()).trustBlock;
    expect(view).toMatchObject({
      blocked: false,
      review: null,
      lift: { reason: LIFT_REASON, score: 35, liftedBy: { id: adminId, fullName: 'Quản trị viên' } },
      lastDecision: { action: 'lift', reason: LIFT_REASON, score: 35 },
    });
    const list = await request(app).get(`${BASE}?q=${encodeURIComponent('Điểm Thấp')}`).set(asAdmin());
    expect(list.body.data[0].trustBlockStatus).toBe('lifted');

    const audit = await AuditLog.findOne({ action: 'user.trust_lift' }).lean().orFail();
    expect(String(audit.actor_id)).toBe(adminId);
    expect(audit.target_type).toBe('USER');
    expect(String(audit.target_id)).toBe(renterId);
    expect(audit.details).toMatchObject({ reason: LIFT_REASON, score: 35, threshold: 50, attempts: 1 });

    await vi.waitFor(async () => {
      const notice = await Notification.findOne({ userId: renterId, type: 'ACCOUNT' }).lean();
      expect(notice).toMatchObject({
        title: 'Bạn đã được gỡ chặn thuê đồ chơi có tiền cọc cao',
        link: `/toys/${highToyId}`,
      });
      expect(notice?.body).toContain(`Lý do: ${LIFT_REASON}`);
    });
    await vi.waitFor(() => expect(emails.some((mail) => mail.subject.includes('gỡ chặn'))).toBe(true));
    // A second lift is refused while the first one holds.
    expect((await decide('lift', { reason: LIFT_REASON })).body.error.code).toBe('TRUST_BLOCK_ALREADY_LIFTED');
  });

  it('lift ends when the score drops: the booking is refused and a new review opens', async () => {
    await book(renterId, highToyId);
    await decide('lift', { reason: LIFT_REASON });
    await User.updateOne({ _id: renterId }, { $set: { 'trust.score': 30 } });
    expect((await book(renterId, highToyId, 10)).body.error.message).toBe(MSG28);
    expect((await detail()).trustBlock).toMatchObject({ blocked: true, lift: null, review: { score: 30 } });
  });

  it('keep: the review closes, the Renter stays blocked and is told', async () => {
    await book(renterId, highToyId);
    const res = await decide('keep', { reason: KEEP_REASON });
    expect(res.status).toBe(200);
    expect(res.body.data.decision).toBe('keep');
    expect((await counts()).trust_review).toBe(0);

    // Still refused; the same score does not reopen the review.
    expect((await book(renterId, highToyId, 10)).body.error.message).toBe(MSG28);
    expect((await counts()).trust_review).toBe(0);
    expect((await detail()).trustBlock).toMatchObject({
      blocked: true,
      review: null,
      lastDecision: { action: 'keep', reason: KEEP_REASON, score: 35 },
    });
    expect((await AuditLog.findOne({ action: 'user.trust_keep' }).lean().orFail()).details).toMatchObject({
      reason: KEEP_REASON,
      score: 35,
      attempts: 1,
    });
    await vi.waitFor(async () => {
      const notice = await Notification.findOne({ userId: renterId, type: 'ACCOUNT' }).lean();
      expect(notice?.title).toBe('Bạn vẫn chưa thể thuê đồ chơi có tiền cọc cao');
      expect(notice?.body).toContain('khi điểm tin cậy dưới 50, bạn chưa thể thuê đồ chơi có tiền cọc trên 500.000 đ');
    });
    // A changed score brings the Renter back to the list.
    await User.updateOne({ _id: renterId }, { $set: { 'trust.score': 42 } });
    await book(renterId, highToyId, 12);
    expect((await counts()).trust_review).toBe(1);
  });

  it('keep after a lift puts the block back', async () => {
    await book(renterId, highToyId);
    await decide('lift', { reason: LIFT_REASON });
    const res = await decide('keep', { reason: KEEP_REASON });
    expect(res.status).toBe(200);
    expect((await book(renterId, highToyId, 10)).status).toBe(403);
    expect((await AuditLog.findOne({ action: 'user.trust_keep' }).lean().orFail()).details).toMatchObject({
      liftRevoked: true,
    });
    await vi.waitFor(async () =>
      expect(
        await Notification.countDocuments({ userId: renterId, title: 'Admin đã áp dụng lại chặn thuê đồ chơi có tiền cọc cao' }),
      ).toBe(1),
    );
  });

  it('lock: uses the account lock (7 days) and closes the review', async () => {
    await book(renterId, highToyId);
    const res = await decide('lock', { duration: '7d', reason: LOCK_REASON });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ decision: 'lock', accountStatus: 'LOCKED' });
    expect(res.body.data.lockedUntil).not.toBeNull();

    const locked = await User.findById(renterId).lean().orFail();
    expect(locked.status).toBe('LOCKED');
    expect(locked.trust?.review).toBeUndefined();
    expect(locked.trust?.decision).toMatchObject({ action: 'lock', reason: LOCK_REASON });
    expect(await AuditLog.countDocuments({ action: 'user.lock', target_id: new Types.ObjectId(renterId) })).toBe(1);
    expect((await AuditLog.findOne({ action: 'user.trust_lock' }).lean().orFail()).details).toMatchObject({
      duration: '7d',
      reason: LOCK_REASON,
    });
    // The locked Renter's token is refused with the lock reason (existing lock behaviour).
    const refused = await book(renterId, highToyId, 10);
    expect(refused.status).toBe(401);
    expect(refused.body.error.code).toBe('USER_INACTIVE');
    expect(refused.body.error.message).toContain(LOCK_REASON);
    await vi.waitFor(async () =>
      expect(await Notification.countDocuments({ userId: renterId, title: /bị khóa/ })).toBe(1),
    );
    // A second lock from the review: nothing waits any more.
    expect((await decide('lock', { duration: '30d', reason: LOCK_REASON })).body.error.code).toBe('TRUST_REVIEW_NOT_OPEN');
  });

  it('lock: permanent, and refused on an account already locked', async () => {
    await book(renterId, highToyId);
    await User.updateOne({ _id: renterId }, { $set: { status: 'LOCKED', 'lock.reason': 'Khóa từ báo cáo vi phạm.' } });
    const res = await decide('lock', { duration: 'permanent', reason: LOCK_REASON });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_ALREADY_LOCKED');
    // Nothing was written: the review still waits.
    expect((await counts()).trust_review).toBe(1);
    expect(await AuditLog.countDocuments({ action: /^user\.trust/ })).toBe(0);
  });

  it('refuses decisions with nothing to decide on', async () => {
    // Full score, no review: nothing to lift, keep or lock.
    expect((await decide('lift', { reason: LIFT_REASON }, ownerId)).body.error.code).toBe('TRUST_BLOCK_NOT_APPLIED');
    expect((await decide('keep', { reason: KEEP_REASON }, ownerId)).body.error.code).toBe('TRUST_REVIEW_NOT_OPEN');
    expect((await decide('lock', { duration: '7d', reason: LOCK_REASON }, ownerId)).body.error.code).toBe('TRUST_REVIEW_NOT_OPEN');
    // Below the threshold but never refused: the Admin may lift ahead of time.
    expect((await decide('lift', { reason: LIFT_REASON })).status).toBe(200);
    expect((await book(renterId, highToyId)).status).toBe(201);
    // Unknown and malformed ids.
    expect((await decide('lift', { reason: LIFT_REASON }, String(new Types.ObjectId()))).status).toBe(404);
    expect((await decide('lift', { reason: LIFT_REASON }, 'abc')).status).toBe(400);
  });

  it('checks the reason like a lock: 20 to 300 characters after trimming', async () => {
    await book(renterId, highToyId);
    const invalid = [
      {},
      { reason: '' },
      { reason: ' '.repeat(30) },
      { reason: 'a'.repeat(19) },
      { reason: `   ${'a'.repeat(19)}   ` },
      { reason: 'a'.repeat(301) },
      { reason: 123_456_789_012_345 },
      { reason: LIFT_REASON, extra: true },
    ];
    for (const body of invalid) {
      const res = await decide('lift', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    for (const body of [{ reason: 'a'.repeat(19) }, { reason: 'a'.repeat(301) }]) {
      expect((await decide('keep', body)).status).toBe(400);
    }
    // Lock: a duration is required and must be one of the three.
    for (const body of [{ reason: LOCK_REASON }, { duration: '14d', reason: LOCK_REASON }, { duration: '7D', reason: LOCK_REASON }]) {
      expect((await decide('lock', body)).status).toBe(400);
    }
    expect((await counts()).trust_review).toBe(1);
    // Exactly 20 and exactly 300 characters are accepted.
    expect((await decide('keep', { reason: 'a'.repeat(20) })).status).toBe(200);
    await User.updateOne({ _id: renterId }, { $set: { 'trust.score': 33 } });
    await book(renterId, highToyId, 10);
    expect((await decide('lift', { reason: 'b'.repeat(300) })).status).toBe(200);
  });

  it('lets only an Admin decide: Guest 401, User 403', async () => {
    await book(renterId, highToyId);
    const guest = await request(app).post(`${BASE}/${renterId}/trust-block/lift`).send({ reason: LIFT_REASON });
    expect(guest.status).toBe(401);
    for (const action of ['lift', 'keep', 'lock'] as const) {
      const user = await request(app)
        .post(`${BASE}/${renterId}/trust-block/${action}`)
        .set(authHeader(ownerId))
        .send({ reason: LIFT_REASON, ...(action === 'lock' ? { duration: '7d' } : {}) });
      expect(user.status).toBe(403);
    }
    expect((await request(app).get(`${BASE}?tab=trust_review`).set(authHeader(ownerId))).status).toBe(403);
    expect((await counts()).trust_review).toBe(1);
  });

  it('refuses the second of two Admin decisions on the same review', async () => {
    await book(renterId, highToyId);
    const [first, second] = await Promise.all([
      decide('keep', { reason: KEEP_REASON }),
      decide('keep', { reason: KEEP_REASON }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);
    expect(await AuditLog.countDocuments({ action: /^user\.trust/ })).toBe(1);
  });
});

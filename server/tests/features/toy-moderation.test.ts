import express from 'express';
import mongoose, { type ClientSession } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditLog } from '../../src/features/audit_logs/audit_logs.model.js';
import { Category } from '../../src/features/categories/categories.model.js';
import { adminToyModerationRouter } from '../../src/features/toys/toy-moderation.routes.js';
import { findContactDetails } from '../../src/features/toys/toy-moderation.warnings.js';
import { Toy } from '../../src/features/toys/toys.model.js';
import { User } from '../../src/features/users/users.model.js';
import { domainEvents } from '../../src/shared/events/domain-events.js';
import { errorHandler } from '../../src/shared/middleware/error-handler.js';
import { testAuth } from '../support/test-auth.js';
import { newId, pause, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

// The app with only this router. Auth is set from test headers (develop's authenticate's job).
const app = express();
app.use(express.json());
app.use(testAuth);
app.use('/api/v1/admin/toys', adminToyModerationRouter);
app.use(errorHandler);

const ADMIN_ID = newId().toString();
const asAdmin = (test: request.Test) =>
  test.set('x-test-user', ADMIN_ID).set('x-test-role', 'ADMIN');
const get = (path: string) => asAdmin(request(app).get(`/api/v1/admin/toys${path}`));
const post = (path: string, body: object) =>
  asAdmin(request(app).post(`/api/v1/admin/toys${path}`)).send(body);

/** Starts a supertest request now (supertest is lazy) and resolves with its response. */
const startRequest = <T>(test: PromiseLike<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    test.then(resolve, reject);
  });

/** Runs `work` in a transaction that stays open until `commit()` is called. */
const openTransaction = async (work: (session: ClientSession) => Promise<unknown>) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  await work(session);
  return {
    commit: async () => {
      await session.commitTransaction();
      await session.endSession();
    },
  };
};

const createToy = (overrides: Record<string, unknown> = {}) =>
  Toy.create({
    ownerId: newId(),
    categoryId: newId(),
    title: 'Wooden train set',
    description: 'Complete set with 20 pieces.',
    condition: 'Như mới',
    listingType: 'rent',
    priceOrRate: 20_000,
    depositPrice: 300_000,
    status: 'active',
    ageRange: { minAge: 3, maxAge: 6 },
    images: [{ url: 'https://example.com/a.jpg', publicId: 'toyflow/a' }],
    ...overrides,
  });

let phoneSeq = 10_000_000;
const createUser = (overrides: Record<string, unknown> = {}) =>
  User.create({
    phone: `+8491${phoneSeq++}`,
    email: `user${phoneSeq}@example.com`,
    passwordHash: 'x',
    fullName: 'Nguyễn Văn An',
    verificationStatus: 'verified',
    ...overrides,
  });

let slugSeq = 0;
const createCategory = (overrides: Record<string, unknown> = {}) =>
  Category.create({ name: `Đồ chơi ${slugSeq}`, slug: `do-choi-${slugSeq++}`, ...overrides });

const photos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    url: `https://example.com/${i}.jpg`,
    publicId: `toyflow/${i}`,
  }));

const createPending = async (
  overrides: Record<string, unknown> = {},
  owner?: Awaited<ReturnType<typeof createUser>>,
) => {
  const user = owner ?? (await createUser());
  const category = await createCategory();
  return createToy({
    ownerId: user._id,
    categoryId: category._id,
    status: 'pending',
    images: photos(3),
    moderation: { submittedAt: new Date() },
    ...overrides,
  });
};

const tokenOf = (toy: { updatedAt: Date }) => toy.updatedAt.toISOString();

beforeEach(async () => {
  await Promise.all([
    Toy.deleteMany({}),
    User.deleteMany({}),
    Category.deleteMany({}),
    AuditLog.collection.deleteMany({}),
  ]);
  domainEvents.clear();
});

describe('access', () => {
  it('answers 401 without a user and 403 for a non-Admin', async () => {
    expect((await request(app).get('/api/v1/admin/toys')).status).toBe(401);
    const user = await request(app)
      .get('/api/v1/admin/toys')
      .set('x-test-user', ADMIN_ID)
      .set('x-test-role', 'USER');
    expect(user.status).toBe(403);
  });
});

describe('queue', () => {
  it('lists pending posts oldest first, masks phones and filters', async () => {
    const owner = await createUser({ phone: '+84912345678' });
    const first = await createPending(
      { moderation: { submittedAt: new Date('2026-10-01') } },
      owner,
    );
    await createPending({
      moderation: { submittedAt: new Date('2026-10-02') },
      listingType: 'donate',
      priceOrRate: 0,
    });
    await createToy({ status: 'active' });

    const response = await get('/');
    expect(response.status).toBe(200);
    expect(response.body.pagination.totalItems).toBe(2);
    expect(response.body.data[0]).toMatchObject({
      id: String(first._id),
      owner: { maskedPhone: '+8491***5678' },
      coverImage: 'https://example.com/0.jpg',
    });
    expect(JSON.stringify(response.body)).not.toContain('+84912345678');

    const donations = await get('/?listingType=donate');
    expect(donations.body.data).toHaveLength(1);
    const byId = await get(`/?q=${String(first._id)}`);
    expect(byId.body.data).toHaveLength(1);
  });

  it('searches the title with the text index', async () => {
    await createPending({ title: 'Xe điều khiển từ xa' });
    await createPending({ title: 'Búp bê' });
    const response = await get('/?q=khiển');
    expect(response.body.data.map((item: { title: string }) => item.title)).toEqual([
      'Xe điều khiển từ xa',
    ]);
  });

  it('counts every status', async () => {
    await createPending();
    await createToy({ status: 'active' });
    const response = await get('/counts');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ pending: 1, active: 1, hidden: 0 });
  });

  it('rejects unknown query values', async () => {
    expect((await get('/?status=approved')).status).toBe(400);
    expect((await get('/?categoryId=abc')).status).toBe(400);
  });
});

describe('detail', () => {
  it('returns warnings for contact info, photos, identity and hidden category', async () => {
    const owner = await createUser({
      verificationStatus: 'pending',
      lock: { until: new Date(Date.now() + 3600_000) },
    });
    const hidden = await createCategory({ status: 'hidden' });
    const toy = await createPending(
      { categoryId: hidden._id, description: 'Liên hệ zalo 0912 345 678 nhé', images: [] },
      owner,
    );

    const response = await get(`/${String(toy._id)}`);
    expect(response.status).toBe(200);
    const codes = response.body.data.warnings.map((warning: { code: string }) => warning.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'CATEGORY_HIDDEN',
        'OWNER_UNVERIFIED',
        'OWNER_LOCKED',
        'TOO_FEW_PHOTOS',
        'CONTACT_PHONE',
        'CONTACT_LINK',
      ]),
    );
    expect(response.body.data).toMatchObject({
      minPhotos: 1,
      owner: { accountStatus: 'LOCKED' },
      updatedAt: tokenOf(toy),
    });
    expect(response.body.data.owner).not.toHaveProperty('phone');
  });

  it('answers 404 for an unknown post and 400 for a bad id', async () => {
    expect((await get(`/${newId().toString()}`)).status).toBe(404);
    expect((await get('/abc')).status).toBe(400);
  });
});

describe('decisions', () => {
  it('approves, writes the audit log and publishes TOY_REVIEWED', async () => {
    const handler = vi.fn();
    domainEvents.subscribe('TOY_REVIEWED', handler);
    const toy = await createPending({
      moderation: { submittedAt: new Date(), rejectReason: 'old' },
    });

    const response = await post(`/${String(toy._id)}/approve`, { expectedUpdatedAt: tokenOf(toy) });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'active',
      moderation: { rejectReason: null },
    });

    const saved = await Toy.findById(toy._id).lean();
    expect(saved?.status).toBe('active');
    const moderation = saved?.moderation as { reviewedBy?: unknown } | undefined;
    expect(String(moderation?.reviewedBy)).toBe(ADMIN_ID);
    const audit = await AuditLog.findOne({ action: 'toy.approve' }).lean();
    expect(audit).toMatchObject({ target_type: 'TOY', target_id: toy._id });
    expect(String(audit?.actor_id)).toBe(ADMIN_ID);
    await vi.waitFor(() =>
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'TOY_REVIEWED', decision: 'approved', toyTitle: toy.title }),
      ),
    );
  });

  it('rejects with a reason', async () => {
    const toy = await createPending();
    const response = await post(`/${String(toy._id)}/reject`, {
      expectedUpdatedAt: tokenOf(toy),
      reason: 'Ảnh không rõ, vui lòng chụp lại.',
    });
    expect(response.status).toBe(200);
    const saved = await Toy.findById(toy._id).lean();
    expect(saved).toMatchObject({
      status: 'hidden',
      moderation: { rejectReason: 'Ảnh không rõ, vui lòng chụp lại.' },
    });
    expect(await AuditLog.countDocuments({ action: 'toy.reject' })).toBe(1);
  });

  it('validates the body: token required, reason 5-500 characters', async () => {
    const toy = await createPending();
    expect((await post(`/${String(toy._id)}/approve`, {})).status).toBe(400);
    expect(
      (await post(`/${String(toy._id)}/reject`, { expectedUpdatedAt: tokenOf(toy), reason: 'x' }))
        .status,
    ).toBe(400);
  });

  it('answers 404 for an unknown post', async () => {
    const response = await post(`/${newId().toString()}/approve`, {
      expectedUpdatedAt: new Date().toISOString(),
    });
    expect(response.status).toBe(404);
  });

  it('refuses a stale token after an Owner edit (409 TOY_CHANGED)', async () => {
    const toy = await createPending();
    const token = tokenOf(toy);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await Toy.updateOne({ _id: toy._id }, { $set: { description: 'Edited by the owner.' } });

    const response = await post(`/${String(toy._id)}/approve`, { expectedUpdatedAt: token });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('TOY_CHANGED');
    expect((await Toy.findById(toy._id).lean())?.status).toBe('pending');
  });

  it('refuses a decided post (409 TOY_ALREADY_DECIDED)', async () => {
    const toy = await createPending();
    await post(`/${String(toy._id)}/approve`, { expectedUpdatedAt: tokenOf(toy) });
    const again = await post(`/${String(toy._id)}/reject`, {
      expectedUpdatedAt: tokenOf(toy),
      reason: 'Không phù hợp.',
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TOY_ALREADY_DECIDED');
  });

  it('refuses to approve a post in a hidden category (409)', async () => {
    const hidden = await createCategory({ status: 'hidden' });
    const toy = await createPending({ categoryId: hidden._id });
    const response = await post(`/${String(toy._id)}/approve`, { expectedUpdatedAt: tokenOf(toy) });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CATEGORY_NOT_AVAILABLE');
  });

  it('refuses to approve when the owner is not VERIFIED or is locked (BF-01)', async () => {
    const unverified = await createPending({}, await createUser({ verificationStatus: 'pending' }));
    const first = await post(`/${String(unverified._id)}/approve`, {
      expectedUpdatedAt: tokenOf(unverified),
    });
    expect(first.status).toBe(422);
    expect(first.body.error.code).toBe('OWNER_NOT_ELIGIBLE');

    const locked = await createPending(
      {},
      await createUser({ lock: { until: new Date(Date.now() + 3600_000) } }),
    );
    const second = await post(`/${String(locked._id)}/approve`, {
      expectedUpdatedAt: tokenOf(locked),
    });
    expect(second.body.error.code).toBe('OWNER_NOT_ELIGIBLE');
    expect(await Toy.countDocuments({ status: 'active' })).toBe(0);

    // Rejecting stays possible.
    const rejected = await post(`/${String(locked._id)}/reject`, {
      expectedUpdatedAt: tokenOf(locked),
      reason: 'Tài khoản đang bị khoá.',
    });
    expect(rejected.status).toBe(200);
  });

  it('approve conflicts with a concurrent hide of the category (no ACTIVE toy in it)', async () => {
    const toy = await createPending();
    // An Admin hides the category in a transaction that has not committed yet.
    const hide = await openTransaction((session) =>
      Category.updateOne(
        { _id: toy.categoryId, status: 'active' },
        { status: 'hidden' },
        { session },
      ),
    );
    const approving = startRequest(
      post(`/${String(toy._id)}/approve`, { expectedUpdatedAt: tokenOf(toy) }),
    );
    await pause(300);
    await hide.commit();
    const response = await approving;
    // A plain read would have seen ACTIVE and approved; the conditional write conflicts,
    // retries after the hide and refuses.
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CATEGORY_NOT_AVAILABLE');
    expect((await Toy.findById(toy._id).lean())?.status).toBe('pending');
  });

  it('lets exactly one of two concurrent decisions win', async () => {
    const toy = await createPending();
    const token = tokenOf(toy);
    const [a, b] = await Promise.all([
      post(`/${String(toy._id)}/approve`, { expectedUpdatedAt: token }),
      post(`/${String(toy._id)}/reject`, { expectedUpdatedAt: token, reason: 'Không phù hợp.' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await AuditLog.countDocuments({})).toBe(1);
  });
});

describe('findContactDetails', () => {
  it('finds phones, accounts and links but not prices', () => {
    expect(findContactDetails('Gọi 0912.345.678')).toMatchObject({ phone: true });
    expect(findContactDetails('STK 1903 4567 8901')).toMatchObject({ bankAccount: true });
    expect(findContactDetails('xem shopee.vn')).toMatchObject({ link: true });
    expect(findContactDetails('Giá 15.000.000 đồng')).toEqual({
      phone: false,
      bankAccount: false,
      link: false,
    });
  });
});

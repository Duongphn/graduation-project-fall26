import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../../src/config/env.js';
import { authenticate } from '../../src/middlewares/authenticate.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { AuditLog } from '../../src/models/audit-log.model.js';
import { Notification } from '../../src/models/notification.model.js';
import { RefreshToken } from '../../src/models/refresh-token.model.js';
import { Toy } from '../../src/models/toy.model.js';
import { User } from '../../src/models/user.model.js';
import { ViolationReport } from '../../src/models/violation-report.model.js';
import { adminAccountsRouter } from '../../src/routes/account-admin.routes.js';
import {
  assertWalletNotFrozen,
  releaseExpiredLocks,
} from '../../src/services/account-lock.service.js';
import { AuthService } from '../../src/services/auth.service.js';
import { subscribeNotifications } from '../../src/services/notification.subscriptions.js';
import { testAuth } from '../support/test-auth.js';
import { newId, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

// notify() delivers in the background through the notification subscriptions; no real email.
let unsubscribe: () => void = () => undefined;
beforeAll(() => {
  unsubscribe = subscribeNotifications({ mailer: { send: () => Promise.resolve({ delivered: false }) } });
});
afterAll(() => unsubscribe());

const BASE = '/api/v1/admin/users';
const app = express();
app.use(express.json());
app.use(testAuth);
app.use(BASE, adminAccountsRouter);
app.use(errorHandler);

// develop's real `authenticate` in front of a probe route.
const authApp = express();
authApp.get('/probe', authenticate, (_request, response) => {
  response.json({ ok: true });
});
authApp.use(errorHandler);

const ADMIN_ID = newId();
const asAdmin = (test: request.Test) =>
  test.set('x-test-user', String(ADMIN_ID)).set('x-test-role', 'ADMIN');
const get = (path = '') => asAdmin(request(app).get(`${BASE}${path}`));
const post = (path: string, body: object) => asAdmin(request(app).post(`${BASE}${path}`)).send(body);

const LOCK_REASON = 'Nhiều lần đăng đồ chơi không an toàn sau khi đã bị cảnh cáo.';
const UNLOCK_REASON = 'Người dùng đã cam kết tuân thủ quy định của ToyFlow.';
const PASSWORD = 'Matkhau@123';

let seq = 0;
const createUser = async (fullName: string, extra: Record<string, unknown> = {}) => {
  seq += 1;
  const user = await User.create({
    phone: `+849${String(seq).padStart(8, '0')}`,
    email: `user${seq}@toyflow.test`,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    fullName,
    ...extra,
  });
  return user;
};

const createToy = (ownerId: Types.ObjectId, status: string, extra: Record<string, unknown> = {}) =>
  Toy.create({
    ownerId,
    categoryId: newId(),
    title: `Đồ chơi ${status}`,
    description: 'Mô tả đồ chơi.',
    condition: 'good',
    listingType: 'rent',
    priceOrRate: 20_000,
    depositPrice: 300_000,
    status,
    ageRange: { minAge: 1, maxAge: 3 },
    images: [{ url: 'https://example.com/1.jpg', publicId: 'toyflow/toys/1' }],
    ...extra,
  });

beforeEach(async () => {
  await Promise.all([
    User.collection.deleteMany({}),
    Toy.collection.deleteMany({}),
    ViolationReport.collection.deleteMany({}),
    Notification.collection.deleteMany({}),
    RefreshToken.collection.deleteMany({}),
    AuditLog.collection.deleteMany({}),
  ]);
  await User.create({
    _id: ADMIN_ID,
    phone: '+84900000000',
    email: 'admin@toyflow.test',
    passwordHash: 'x',
    fullName: 'Quản trị viên',
    role: 'ADMIN',
  });
});

describe('UC29 account list and detail', () => {
  it('lists accounts with masked contacts, violation counts, tabs and search', async () => {
    const an = await createUser('Nguyễn Văn An');
    const binh = await createUser('Trần Bình');
    await createUser('Lê Cường', { status: 'LOCKED', lock: { reason: 'Vi phạm' } });
    await ViolationReport.collection.insertMany([
      { reporterId: binh._id, target: { kind: 'user', id: an._id, userId: an._id }, reason: 'scam', isUnsafe: false, description: 'x', status: 'resolved', createdAt: new Date() },
      { reporterId: binh._id, target: { kind: 'toy', id: newId(), userId: an._id }, reason: 'spam', isUnsafe: false, description: 'x', status: 'pending', createdAt: new Date() },
      { reporterId: an._id, target: { kind: 'user', id: binh._id, userId: binh._id }, reason: 'spam', isUnsafe: false, description: 'x', status: 'dismissed', createdAt: new Date() },
    ]);

    const list = await get('?role=USER&sortBy=violationCount');
    expect(list.status).toBe(200);
    expect(list.body.pagination.totalItems).toBe(3);
    expect(list.body.data[0]).toMatchObject({
      fullName: 'Nguyễn Văn An',
      violationCount: 1,
      pendingReportCount: 1,
      accountStatus: 'ACTIVE',
    });
    expect(list.body.data[0].maskedPhone).toMatch(/\*\*\*/);
    expect(list.body.data[0].maskedEmail).toMatch(/\*\*\*@toyflow\.test/);
    expect(list.body.data[0]).not.toHaveProperty('phone');

    const counts = await get('/counts?role=USER');
    expect(counts.body.data).toEqual({ all: 3, active: 2, locked: 1, reported: 1 });

    const locked = await get('?tab=locked');
    expect(locked.body.data.map((row: { fullName: string }) => row.fullName)).toEqual(['Lê Cường']);
    const reported = await get('?tab=reported');
    expect(reported.body.data.map((row: { fullName: string }) => row.fullName)).toEqual(['Nguyễn Văn An']);
    const byName = await get(`?q=${encodeURIComponent('nguyen van')}`);
    expect(byName.body.pagination.totalItems).toBe(1);
    const byPhone = await get(`?q=${encodeURIComponent(an.phone.slice(-6))}`);
    expect(byPhone.body.data[0].id).toBe(String(an._id));

    const detail = await get(`/${an._id}`);
    expect(detail.body.data).toMatchObject({
      phone: an.phone,
      email: an.email,
      lock: null,
      violations: [{ reason: 'scam', targetKind: 'user' }],
    });
  });

  it('is Admin only', async () => {
    const asUser = await request(app).get(BASE).set('x-test-user', String(newId()));
    expect(asUser.status).toBe(403);
    expect((await get(`/${newId()}`)).status).toBe(404);
  });
});

describe('UC29 lock and unlock', () => {
  it('locks permanently: hides Active listings, ends sessions, keeps other listings', async () => {
    const user = await createUser('Phạm Dũng');
    const active = await createToy(user._id, 'active');
    const pending = await createToy(user._id, 'pending');
    const ownHidden = await createToy(user._id, 'hidden');
    await RefreshToken.create({ userId: user._id, token: 'tok-1', expiresAt: new Date(Date.now() + 86_400_000) });

    const response = await post(`/${user._id}/lock`, { duration: 'permanent', reason: LOCK_REASON });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ accountStatus: 'LOCKED', lockedUntil: null, listingsChanged: 1 });

    const saved = await User.findById(user._id).orFail();
    expect(saved.status).toBe('LOCKED');
    expect(saved.lock?.until).toBeUndefined();
    expect(String(saved.lock?.lockedBy)).toBe(String(ADMIN_ID));
    expect((await Toy.findById(active._id).orFail()).status).toBe('hidden');
    expect((await Toy.findById(pending._id).orFail()).status).toBe('pending');
    expect((await Toy.findById(ownHidden._id).orFail()).status).toBe('hidden');
    expect(await RefreshToken.countDocuments({ userId: user._id })).toBe(0);
    await vi.waitFor(async () => expect(await Notification.countDocuments({ userId: user._id, type: 'ACCOUNT', title: /bị khóa/ })).toBe(1));
    const audit = await AuditLog.findOne({ action: 'user.lock' }).orFail();
    expect(audit.details).toMatchObject({ duration: 'permanent', reason: LOCK_REASON, hiddenListings: 1 });

    const detail = await get(`/${user._id}`);
    expect(detail.body.data.lock).toMatchObject({
      reason: LOCK_REASON,
      until: null,
      lockedBy: { fullName: 'Quản trị viên' },
      hiddenListingCount: 1,
    });

    const again = await post(`/${user._id}/lock`, { duration: '7d', reason: LOCK_REASON });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ACCOUNT_ALREADY_LOCKED');
  });

  it('unlocks with a reason and shows again only the listings the lock hid', async () => {
    const user = await createUser('Hoàng Em');
    const first = await createToy(user._id, 'active');
    const second = await createToy(user._id, 'active');
    const ownHidden = await createToy(user._id, 'hidden');
    await post(`/${user._id}/lock`, { duration: '30d', reason: LOCK_REASON });
    // Meanwhile the second listing is removed for a violation: it stays hidden.
    await Toy.updateOne({ _id: second._id }, { $set: { 'moderation.rejectReason': 'Vi phạm' } });

    const response = await post(`/${user._id}/unlock`, { reason: UNLOCK_REASON });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ accountStatus: 'ACTIVE', listingsChanged: 1 });
    const saved = await User.findById(user._id).orFail();
    expect(saved.status).toBe('ACTIVE');
    expect(saved.lock?.reason).toBeUndefined();
    expect(saved.lock?.hiddenToyIds).toBeUndefined();
    expect((await Toy.findById(first._id).orFail()).status).toBe('active');
    expect((await Toy.findById(second._id).orFail()).status).toBe('hidden');
    expect((await Toy.findById(ownHidden._id).orFail()).status).toBe('hidden');
    await vi.waitFor(async () => expect(await Notification.countDocuments({ userId: user._id, type: 'ACCOUNT', title: /mở khóa/ })).toBe(1));
    expect(await AuditLog.countDocuments({ action: 'user.unlock', actor_id: ADMIN_ID })).toBe(1);

    const again = await post(`/${user._id}/unlock`, { reason: UNLOCK_REASON });
    expect(again.body.error.code).toBe('ACCOUNT_NOT_LOCKED');
  });

  it('refuses a short reason, an Admin account and an unknown account', async () => {
    const user = await createUser('Vũ Giang');
    expect((await post(`/${user._id}/lock`, { duration: '7d', reason: 'quá ngắn' })).status).toBe(400);
    expect((await post(`/${user._id}/lock`, { duration: '1d', reason: LOCK_REASON })).status).toBe(400);
    const admin = await post(`/${ADMIN_ID}/lock`, { duration: '7d', reason: LOCK_REASON });
    expect(admin.status).toBe(422);
    expect(admin.body.error.code).toBe('CANNOT_LOCK_ADMIN');
    expect((await post(`/${newId()}/lock`, { duration: '7d', reason: LOCK_REASON })).status).toBe(404);
  });

  it('ends timed locks that have run out (job) and shows the listings again', async () => {
    const user = await createUser('Đỗ Hà');
    const toy = await createToy(user._id, 'active');
    await post(`/${user._id}/lock`, { duration: '7d', reason: LOCK_REASON });
    const permanent = await createUser('Bùi Khánh');
    await post(`/${permanent._id}/lock`, { duration: 'permanent', reason: LOCK_REASON });

    expect(await releaseExpiredLocks(new Date())).toEqual({ found: 0, released: 0 });
    const later = new Date(Date.now() + 8 * 86_400_000);
    await User.updateOne({ _id: user._id }, { $set: { 'lock.until': new Date(Date.now() - 1000) } });
    expect(await releaseExpiredLocks(later)).toEqual({ found: 1, released: 1 });

    expect((await User.findById(user._id).orFail()).status).toBe('ACTIVE');
    expect((await User.findById(permanent._id).orFail()).status).toBe('LOCKED');
    expect((await Toy.findById(toy._id).orFail()).status).toBe('active');
    const audit = await AuditLog.findOne({ action: 'user.unlock' }).orFail();
    expect(audit.actor_id).toBeUndefined();
    expect(audit.details).toMatchObject({ expired: true, restoredListings: 1 });
  });
});

describe('lock hooks outside the Admin area', () => {
  const tokenOf = (userId: Types.ObjectId) =>
    jwt.sign({ userId: String(userId), role: 'USER' }, env.jwtAccessSecret);

  it('authenticate refuses a locked account at once (401 with the reason)', async () => {
    const user = await createUser('Ngô Lan');
    const token = tokenOf(user._id);
    expect((await request(authApp).get('/probe').set('Authorization', `Bearer ${token}`)).status).toBe(200);

    await post(`/${user._id}/lock`, { duration: '7d', reason: LOCK_REASON });
    const refused = await request(authApp).get('/probe').set('Authorization', `Bearer ${token}`);
    expect(refused.status).toBe(401);
    expect(refused.body.error.code).toBe('USER_INACTIVE');
    expect(refused.body.error.message).toContain(LOCK_REASON);

    // A timed lock that has run out no longer blocks.
    await User.updateOne({ _id: user._id }, { $set: { 'lock.until': new Date(Date.now() - 1000) } });
    expect((await request(authApp).get('/probe').set('Authorization', `Bearer ${token}`)).status).toBe(200);
  });

  it('sign-in shows MSG12 with the lock reason', async () => {
    const user = await createUser('Mai Linh');
    await post(`/${user._id}/lock`, { duration: 'permanent', reason: LOCK_REASON });
    const auth = new AuthService({
      sendOtpEmail: () => Promise.resolve(),
      sendResetPasswordEmail: () => Promise.resolve(),
    } as unknown as ConstructorParameters<typeof AuthService>[0]);
    await expect(auth.login({ identifier: user.email, password: PASSWORD } as never)).rejects.toMatchObject({
      statusCode: 403,
      code: 'USER_INACTIVE',
      message: `Tài khoản của bạn đã bị khóa. Lý do: ${LOCK_REASON}`,
    });
  });

  it('freezes the wallet of a locked account', async () => {
    const user = await createUser('Tạ Minh');
    await expect(assertWalletNotFrozen(String(user._id))).resolves.toBeUndefined();
    await post(`/${user._id}/lock`, { duration: '30d', reason: LOCK_REASON });
    await expect(assertWalletNotFrozen(String(user._id))).rejects.toMatchObject({ code: 'WALLET_FROZEN' });
  });
});

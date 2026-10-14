import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditLogModel } from '../../src/features/audit_logs/audit_logs.model.js';
import { adminIdentityReviewRouter } from '../../src/features/identity_verifications/index.js';
import { signDocuments } from '../../src/features/identity_verifications/admin/identity-review.documents.js';
import { IdentityVerificationModel } from '../../src/features/identity_verifications/identity_verifications.model.js';
import { UserModel } from '../../src/features/users/users.model.js';
import { domainEvents } from '../../src/shared/events/domain-events.js';
import type { IdentityReviewedEvent } from '../../src/shared/events/domain-events.js';
import { identityDetailSchema } from '../../src/features/identity_verifications/admin/identity-review.schemas.js';
import { errorHandler } from '../../src/shared/middleware/error-handler.js';
import { newId, useTestDatabase } from '../database/helpers.js';

// env is read when config/env.ts is first imported: configure Cloudinary before the imports.
vi.hoisted(() => {
  process.env.CLOUDINARY_CLOUD_NAME = 'demo';
  process.env.CLOUDINARY_API_KEY = 'key';
  process.env.CLOUDINARY_API_SECRET = 'secret';
});

useTestDatabase();

const ADMIN_ID = newId().toString();
const BASE = '/api/v1/admin/identity-verifications';

// Stand-in for the JWT middleware: x-test-user / x-test-role set request.auth.
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = req.header('x-test-user');
  const role = req.header('x-test-role');
  if (userId) req.auth = { userId, role: role === 'ADMIN' ? 'ADMIN' : 'USER' };
  next();
});
app.use(BASE, adminIdentityReviewRouter);
app.use(errorHandler);

const asAdmin = (test: request.Test) =>
  test.set('x-test-user', ADMIN_ID).set('x-test-role', 'ADMIN');
const get = (path: string) => asAdmin(request(app).get(`${BASE}${path}`));
const post = (path: string, body: object = {}) =>
  asAdmin(request(app).post(`${BASE}${path}`)).send(body);

const image = (name: string) => ({ publicId: `toyflow/identity/${name}`, format: 'jpg' });
let phoneCounter = 100_000;

const createUser = (overrides: Record<string, unknown> = {}) => {
  phoneCounter += 1;
  return UserModel.create({
    phone: `+84912${phoneCounter}`,
    email: `user${phoneCounter}@example.com`,
    passwordHash: 'hash',
    fullName: 'Nguyễn Văn An',
    identityStatus: 'PENDING',
    dateOfBirth: new Date('2000-05-01T00:00:00Z'),
    ...overrides,
  });
};

const createVerification = (userId: unknown, overrides: Record<string, unknown> = {}) =>
  IdentityVerificationModel.create({
    userId,
    frontImage: image('front'),
    backImage: image('back'),
    selfieImage: image('selfie'),
    ...overrides,
  });

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    IdentityVerificationModel.deleteMany({}),
    AuditLogModel.collection.deleteMany({}),
  ]);
});

afterEach(() => {
  domainEvents.clear();
});

describe('access', () => {
  it('answers 401 without a user and 403 for a non-Admin', async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
    const asUser = await request(app)
      .get(BASE)
      .set('x-test-user', ADMIN_ID)
      .set('x-test-role', 'USER');
    expect(asUser.status).toBe(403);
  });
});

describe('queue and counts', () => {
  it('lists pending requests oldest first, masked, with previous attempts', async () => {
    const an = await createUser();
    const binh = await createUser({ fullName: 'Trần Bình', email: 'binh@example.com' });
    await createVerification(an._id, {
      status: 'REJECTED',
      rejectReason: 'Ảnh mờ quá',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await createVerification(an._id, { createdAt: new Date('2026-02-01T00:00:00Z') });
    await createVerification(binh._id, { createdAt: new Date('2026-01-15T00:00:00Z') });

    const response = await get('');
    expect(response.status).toBe(200);
    expect(response.body.pagination.totalItems).toBe(2);
    const [first, second] = response.body.data;
    expect(first.user.fullName).toBe('Trần Bình');
    expect(first.previousAttempts).toBe(0);
    expect(second.previousAttempts).toBe(1);
    expect(second.user.maskedPhone).toMatch(/^\+8491\*\*\*\d{4}$/);
    expect(second.user.maskedEmail).toMatch(/\*\*\*@example\.com$/);
    expect(JSON.stringify(response.body)).not.toContain('toyflow/identity');
  });

  it('searches by name without accents, email prefix and phone', async () => {
    const an = await createUser();
    const binh = await createUser({ fullName: 'Trần Bình', email: 'binh@example.com' });
    await createVerification(an._id);
    await createVerification(binh._id);

    const byName = await get('?q=tran binh');
    expect(byName.body.data.map((item: { user: { id: string } }) => item.user.id)).toEqual([
      String(binh._id),
    ]);
    const byEmail = await get('?q=binh@');
    expect(byEmail.body.pagination.totalItems).toBe(1);
    const byPhone = await get(`?q=0${an.phone.slice(3)}`);
    expect(byPhone.body.data[0].user.id).toBe(String(an._id));
    expect((await get('?q=nobody')).body.data).toEqual([]);
  });

  it('validates the query and counts each status', async () => {
    expect((await get('?status=UNKNOWN')).status).toBe(400);
    expect((await get('/counts?x=1')).status).toBe(400);
    const user = await createUser();
    await createVerification(user._id);
    await createVerification(user._id, { status: 'REJECTED', rejectReason: 'Ảnh mờ quá' });
    const counts = await get('/counts');
    expect(counts.body.data).toEqual({ PENDING: 1, VERIFIED: 0, REJECTED: 1 });
  });
});

describe('detail', () => {
  it('signs the three documents for 5 minutes while PENDING and audits the access', async () => {
    const user = await createUser();
    const verification = await createVerification(user._id);

    const response = await get(`/${verification._id}`);
    expect(response.status).toBe(200);
    expect(identityDetailSchema.safeParse(response.body.data).success).toBe(true);
    const { documents, previewAvailable, previewExpiresAt } = response.body.data;
    expect(previewAvailable).toBe(true);
    for (const key of ['frontImage', 'backImage', 'selfieImage']) {
      expect(documents[key].url).toMatch(
        /^https:\/\/api\.cloudinary\.com\/v1_1\/demo\/image\/download\?/,
      );
      expect(documents[key].url).toContain('type=authenticated');
    }
    const ttl = new Date(previewExpiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(4 * 60_000);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000);

    const audits = await AuditLogModel.find({ action: 'identity.view_documents' }).lean();
    expect(audits).toHaveLength(1);
    expect(String(audits[0]?.actorId)).toBe(ADMIN_ID);
    expect(audits[0]?.target).toMatchObject({ kind: 'IDENTITY_VERIFICATION' });
  });

  it('returns no links and writes no audit once decided', async () => {
    const user = await createUser();
    const verification = await createVerification(user._id, {
      status: 'VERIFIED',
      reviewedAt: new Date(),
    });
    const response = await get(`/${verification._id}`);
    expect(response.body.data.documents).toEqual({
      frontImage: null,
      backImage: null,
      selfieImage: null,
    });
    expect(response.body.data.previewAvailable).toBe(false);
    expect(await AuditLogModel.countDocuments({ action: 'identity.view_documents' })).toBe(0);
  });

  it('builds no link without Cloudinary credentials (no raw URL fallback)', () => {
    const signed = signDocuments(
      { status: 'PENDING', frontImage: image('f'), backImage: image('b'), selfieImage: image('s') },
      { credentials: {} },
    );
    expect(signed).toEqual({
      documents: { frontImage: null, backImage: null, selfieImage: null },
      previewAvailable: false,
      previewExpiresAt: null,
    });
  });

  it('answers 404 and 400 for unknown and invalid ids', async () => {
    expect((await get(`/${newId()}`)).status).toBe(404);
    expect((await get('/not-an-id')).status).toBe(400);
  });
});

describe('decisions', () => {
  it('approves in one transaction and publishes IDENTITY_REVIEWED after commit', async () => {
    const events: IdentityReviewedEvent[] = [];
    domainEvents.subscribe('IDENTITY_REVIEWED', (event) => {
      events.push(event);
    });
    const user = await createUser();
    const verification = await createVerification(user._id);

    const response = await post(`/${verification._id}/approve`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'VERIFIED', rejectReason: null });
    expect((await UserModel.findById(user._id).lean())?.identityStatus).toBe('VERIFIED');
    const stored = await IdentityVerificationModel.findById(verification._id).lean();
    expect(String(stored?.reviewedBy)).toBe(ADMIN_ID);
    const audit = await AuditLogModel.findOne({ action: 'identity.verify' }).lean();
    expect(audit?.meta).toMatchObject({ before: { identityStatus: 'PENDING' } });
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      verificationId: String(verification._id),
      userId: String(user._id),
      decision: 'VERIFIED',
      reviewedBy: ADMIN_ID,
    });
  });

  it('rejects with a reason and validates the bodies', async () => {
    const user = await createUser();
    const verification = await createVerification(user._id);
    expect((await post(`/${verification._id}/reject`, { reason: 'abc' })).status).toBe(400);
    expect((await post(`/${verification._id}/reject`, {})).status).toBe(400);
    expect((await post(`/${verification._id}/approve`, { extra: true })).status).toBe(400);

    const response = await post(`/${verification._id}/reject`, { reason: 'Ảnh mờ, chụp lại' });
    expect(response.status).toBe(200);
    expect(response.body.data.rejectReason).toBe('Ảnh mờ, chụp lại');
    expect((await UserModel.findById(user._id).lean())?.identityStatus).toBe('REJECTED');
    expect(await AuditLogModel.countDocuments({ action: 'identity.reject' })).toBe(1);
  });

  it('answers 404 for an unknown request and 409 for a decided one', async () => {
    expect((await post(`/${newId()}/approve`)).status).toBe(404);
    const user = await createUser();
    const verification = await createVerification(user._id);
    await post(`/${verification._id}/approve`);
    const again = await post(`/${verification._id}/reject`, { reason: 'Đổi ý rồi nhé' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('IDENTITY_VERIFICATION_ALREADY_DECIDED');
  });

  it('lets only one of two concurrent decisions win', async () => {
    const user = await createUser();
    const verification = await createVerification(user._id);
    const results = await Promise.all([
      post(`/${verification._id}/approve`),
      post(`/${verification._id}/reject`, { reason: 'Ảnh không khớp' }),
    ]);
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([200, 409]);
    const audits = await AuditLogModel.countDocuments({
      action: { $in: ['identity.verify', 'identity.reject'] },
    });
    expect(audits).toBe(1);
    const stored = await IdentityVerificationModel.findById(verification._id).lean();
    expect((await UserModel.findById(user._id).lean())?.identityStatus).toBe(stored?.status);
  });
});

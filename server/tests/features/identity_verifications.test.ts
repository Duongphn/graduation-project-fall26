import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditLog } from '../../src/features/audit_logs/audit_logs.model.js';
import { adminIdentityReviewRouter } from '../../src/features/identity_verifications/index.js';
import {
  setReviewStorage,
  signDocuments,
} from '../../src/features/identity_verifications/admin/identity-review.documents.js';
import { identityDetailSchema } from '../../src/features/identity_verifications/admin/identity-review.schemas.js';
import { IdentityVerification } from '../../src/features/identity_verifications/identity_verifications.model.js';
import type { IdentityImageStorage } from '../../src/features/identity_verifications/identity-verification.ports.js';
import { Notification } from '../../src/features/notifications/notifications.model.js';
import { User } from '../../src/features/users/users.model.js';
import { domainEvents } from '../../src/shared/events/domain-events.js';
import type { IdentityReviewedEvent } from '../../src/shared/events/domain-events.js';
import { errorHandler } from '../../src/shared/middleware/error-handler.js';
import { testAuth } from '../support/test-auth.js';
import { newId, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const ADMIN_ID = newId().toString();
const BASE = '/api/v1/admin/identity-verifications';

// Fake of develop's IdentityImageStorage: authorized links valid for 5 minutes.
const fakeStorage: IdentityImageStorage = {
  async upload() {
    return { publicId: 'x', deliveryType: 'authenticated' };
  },
  async delete() {},
  async getAuthorizedDelivery(publicId: string) {
    return {
      url: `https://res.cloudinary.com/demo/image/authenticated/s--sig--/${publicId}`,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    };
  },
};

beforeAll(() => setReviewStorage(fakeStorage));
afterAll(() => setReviewStorage(undefined));

// testAuth stands in for develop's authenticate (x-test-user / x-test-role set req.auth).
const app = express();
app.use(express.json());
app.use(testAuth);
app.use(BASE, adminIdentityReviewRouter);
app.use(errorHandler);

const asAdmin = (test: request.Test) =>
  test.set('x-test-user', ADMIN_ID).set('x-test-role', 'ADMIN');
const get = (path: string) => asAdmin(request(app).get(`${BASE}${path}`));
const post = (path: string, body: object = {}) =>
  asAdmin(request(app).post(`${BASE}${path}`)).send(body);

const image = (name: string) => ({
  publicId: `toyflow/identity/${name}`,
  deliveryType: 'authenticated' as const,
});
let phoneCounter = 100_000;

const createUser = (overrides: Record<string, unknown> = {}) => {
  phoneCounter += 1;
  return User.create({
    phone: `+84912${phoneCounter}`,
    email: `user${phoneCounter}@example.com`,
    passwordHash: 'hash',
    fullName: 'Nguyễn Văn An',
    verificationStatus: 'pending',
    ...overrides,
  });
};

let cardCounter = 100_000_000;

const createVerification = (userId: unknown, overrides: Record<string, unknown> = {}) => {
  cardCounter += 1;
  return IdentityVerification.create({
    userId,
    phone: '+84912000000',
    idCardNumber: `001${cardCounter}`,
    frontImage: image('front'),
    backImage: image('back'),
    selfie: image('selfie'),
    ...overrides,
  });
};

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    IdentityVerification.deleteMany({}),
    AuditLog.deleteMany({}),
    Notification.deleteMany({}),
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
      status: 'rejected',
      rejectionReason: 'Ảnh mờ quá',
      submittedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await createVerification(an._id, { submittedAt: new Date('2026-02-01T00:00:00Z') });
    await createVerification(binh._id, { submittedAt: new Date('2026-01-15T00:00:00Z') });

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
    await createVerification(user._id, { status: 'rejected', rejectionReason: 'Ảnh mờ quá' });
    const counts = await get('/counts');
    expect(counts.body.data).toEqual({ pending: 1, verified: 0, rejected: 1 });
  });
});

describe('detail', () => {
  it('links the three documents while pending and audits the access', async () => {
    const user = await createUser();
    const verification = await createVerification(user._id);

    const response = await get(`/${verification._id}`);
    expect(response.status).toBe(200);
    expect(identityDetailSchema.safeParse(response.body.data).success).toBe(true);
    const { documents, previewAvailable, previewExpiresAt } = response.body.data;
    expect(previewAvailable).toBe(true);
    for (const key of ['frontImage', 'backImage', 'selfie']) {
      expect(documents[key].url).toContain('/image/authenticated/');
    }
    const ttl = new Date(previewExpiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(4 * 60_000);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000);

    const audits = await AuditLog.find({ action: 'identity.view_documents' }).lean();
    expect(audits).toHaveLength(1);
    expect(String(audits[0]?.actor_id)).toBe(ADMIN_ID);
    expect(audits[0]?.target_type).toBe('IDENTITY_VERIFICATION');
  });

  it('returns no links and writes no audit once decided', async () => {
    const user = await createUser();
    const verification = await createVerification(user._id, {
      status: 'verified',
      reviewedAt: new Date(),
    });
    const response = await get(`/${verification._id}`);
    expect(response.body.data.documents).toEqual({
      frontImage: null,
      backImage: null,
      selfie: null,
    });
    expect(response.body.data.previewAvailable).toBe(false);
    expect(await AuditLog.countDocuments({ action: 'identity.view_documents' })).toBe(0);
  });

  it('builds no link without a configured storage (no raw URL fallback)', async () => {
    setReviewStorage(null);
    const signed = await signDocuments({
      status: 'pending',
      frontImage: image('f'),
      backImage: image('b'),
      selfie: image('s'),
    });
    setReviewStorage(fakeStorage);
    expect(signed).toEqual({
      documents: { frontImage: null, backImage: null, selfie: null },
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
  it('approves through develop review and publishes IDENTITY_REVIEWED', async () => {
    const events: IdentityReviewedEvent[] = [];
    domainEvents.subscribe('IDENTITY_REVIEWED', (event) => {
      events.push(event);
    });
    const user = await createUser();
    const verification = await createVerification(user._id);

    const response = await post(`/${verification._id}/approve`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'verified', rejectionReason: null });
    expect((await User.findById(user._id).lean())?.verificationStatus).toBe('verified');
    const stored = await IdentityVerification.findById(verification._id).lean();
    expect(String(stored?.reviewedBy)).toBe(ADMIN_ID);
    expect((await User.findById(user._id).lean())?.idCardNumber).toBe(verification.idCardNumber);
    expect(await AuditLog.countDocuments({ action: 'identity.verify' })).toBe(1);
    // Develop's DefaultIdentityVerificationEvents writes the in-app notification.
    expect(await Notification.countDocuments({ userId: user._id })).toBe(1);
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      verificationId: String(verification._id),
      userId: String(user._id),
      decision: 'verified',
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
    expect(response.body.data.rejectionReason).toBe('Ảnh mờ, chụp lại');
    expect((await User.findById(user._id).lean())?.verificationStatus).toBe('rejected');
    expect(await AuditLog.countDocuments({ action: 'identity.reject' })).toBe(1);
  });

  it('answers 404 for an unknown request and 409 for a decided one', async () => {
    expect((await post(`/${newId()}/approve`)).status).toBe(404);
    const user = await createUser();
    const verification = await createVerification(user._id);
    await post(`/${verification._id}/approve`);
    const again = await post(`/${verification._id}/reject`, { reason: 'Đổi ý rồi nhé' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SUBMISSION_NOT_PENDING');
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
    const audits = await AuditLog.countDocuments({
      action: { $in: ['identity.verify', 'identity.reject'] },
    });
    expect(audits).toBe(1);
    const stored = await IdentityVerification.findById(verification._id).lean();
    expect((await User.findById(user._id).lean())?.verificationStatus).toBe(stored?.status);
  });
});

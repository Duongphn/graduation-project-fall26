// Donation flow through the whole app (createApp) behind the real JWT middleware: users and
// Admins sign in with POST /auth/login (no dev-auth header). Covers the toy guards of GB-12
// (D-01), the closing of PENDING requests of a hidden or deleted toy (D-06), receipt photos
// (GB-20), the locked donor (GB-05), the expiry job (R03 job 9) and the races between them.
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createToy, useTestDatabase } from '../database/helpers.js';

vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('ALLOW_DEV_AUTH', 'false');
vi.stubEnv('JWT_ACCESS_SECRET', 'lifecycle_access_secret');
vi.stubEnv('JWT_REFRESH_SECRET', 'lifecycle_refresh_secret');

useTestDatabase();

const PASSWORD = 'Secret#123';
const DAY = 24 * 60 * 60 * 1000;
type Who = 'donor' | 'receiver' | 'other' | 'admin' | 'admin2';
type ExpireFn = typeof import('../../src/features/donation_requests/index.js').expireStaleRequests;

let app: import('express').Express;
let expireStaleRequests: ExpireFn;
const ids = {} as Record<Who, string>;
const tokens = {} as Record<Who, string>;
let toyId: string;
let orgId: string;

const db = () => mongoose.connection;
const oid = (id: string) => new Types.ObjectId(id);
const bearer = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` });
const photo = (who: Who, name = 'p1') => ({
  publicId: `toyflow/handovers/${ids[who]}/${name}`,
  format: 'jpg',
});
const post = (who: Who, path: string, body: object = {}) =>
  request(app).post(`/api/v1${path}`).set(bearer(who)).send(body);
const toyStatus = async () =>
  (
    await db()
      .collection('toys')
      .findOne({ _id: oid(toyId) })
  )?.status;
const requestDoc = (id: string) =>
  db()
    .collection('donation_requests')
    .findOne({ _id: oid(id) });
// Notifications are written by event handlers after the response.
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const notesFor = (who: Who) =>
  db()
    .collection('notifications')
    .find({ userId: oid(ids[who]) })
    .toArray();

beforeAll(async () => {
  const { createApp } = await import('../../src/app/create-app.js');
  const { subscribeNotifications } = await import('../../src/features/notifications/index.js');
  ({ expireStaleRequests } = await import('../../src/features/donation_requests/index.js'));
  subscribeNotifications({ mailer: { send: async () => ({ delivered: false }) } } as never);
  app = createApp();
  const hash = await bcrypt.hash(PASSWORD, 4);
  const people: Array<[Who, 'USER' | 'ADMIN']> = [
    ['donor', 'USER'],
    ['receiver', 'USER'],
    ['other', 'USER'],
    ['admin', 'ADMIN'],
    ['admin2', 'ADMIN'],
  ];
  for (const [index, [who, role]] of people.entries()) {
    const _id = new Types.ObjectId();
    ids[who] = String(_id);
    await db()
      .collection('users')
      .insertOne({
        _id,
        phone: `+8490100000${index}`,
        email: `${who}@lifecycle.example.com`,
        passwordHash: hash,
        fullName: who,
        role,
        status: 'ACTIVE',
        identityStatus: 'VERIFIED',
        trust: { ratingCount: 0, ratingSum: 0, bookingBlocked: false },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: `${who}@lifecycle.example.com`, password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    tokens[who] = res.body.data.tokens.accessToken;
  }
}, 120_000);

beforeEach(async () => {
  await Promise.all(
    [
      'donation_requests',
      'toys',
      'organizations',
      'notifications',
      'audit_logs',
      'order_status_history',
      'system_settings',
    ].map((name) => db().collection(name).deleteMany({})),
  );
  await db()
    .collection('users')
    .updateMany({}, { $set: { status: 'ACTIVE' } });
  toyId = String(
    (await createToy({ ownerId: oid(ids.donor), listingType: 'DONATION', pricing: {} }))._id,
  );
  const org = await db().collection('organizations').insertOne({
    name: 'Org A',
    address: '1 Street',
    contactInfo: 'Ms. Lan',
    supportCriteria: 'Children',
    phone: '+84901999999',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
  });
  orgId = String(org.insertedId);
});

const create = async (who: Who = 'receiver') => {
  const res = await post(who, '/donation-requests', { toyId, message: 'Cho con tôi' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
};
const accepted = async (who: Who = 'receiver') => {
  const id = await create(who);
  expect((await post('donor', `/donation-requests/${id}/accept`)).status).toBe(200);
  return id;
};
const shipping = async () => {
  const id = await accepted();
  const res = await post('donor', `/donation-requests/${id}/handover`, {
    photos: [photo('donor')],
  });
  expect(res.status).toBe(200);
  return id;
};
const hide = () => post('donor', `/toys/${toyId}/hide`);
const remove = () => request(app).delete(`/api/v1/toys/${toyId}`).set(bearer('donor'));
const edit = () =>
  request(app).patch(`/api/v1/toys/${toyId}`).set(bearer('donor')).send({ title: 'New title' });

describe('real JWT: users and Admins (D-10)', () => {
  it('runs the USER flow end to end with history, notifications and the donor profile', async () => {
    const id = await shipping();
    const done = await post('receiver', `/donation-requests/${id}/confirm-received`, {
      photos: [photo('receiver')],
    });
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('COMPLETED');
    expect(await toyStatus()).toBe('DONATED');
    // LI-05: no fee, deposit or delivery tracking in the DTO.
    expect(JSON.stringify(done.body.data)).not.toMatch(/fee|deposit|tracking/i);
    expect(
      await db()
        .collection('order_status_history')
        .countDocuments({ orderId: oid(id) }),
    ).toBe(4);
    await settle();
    expect((await notesFor('donor')).length).toBeGreaterThan(0);
    expect((await notesFor('receiver')).length).toBeGreaterThan(0);
    const summary = await request(app).get(`/api/v1/users/${ids.donor}/donation-summary`);
    expect(summary.body.data.completedDonations).toBe(1);
  });

  it('refuses missing and bad tokens, and users on the admin routes', async () => {
    expect((await request(app).post('/api/v1/donation-requests').send({ toyId })).status).toBe(401);
    const badToken = await request(app)
      .post('/api/v1/donation-requests')
      .set('Authorization', 'Bearer not-a-token')
      .send({ toyId });
    expect(badToken.status).toBe(401);
    const asUser = await post('receiver', '/admin/donation-requests', {
      toyId,
      organizationId: orgId,
    });
    expect(asUser.status).toBe(403);
  });

  it('Admin: plain user on user routes; cannot accept; confirms a USER receipt only with a reason', async () => {
    const id = await create();
    expect((await post('admin', `/donation-requests/${id}/accept`)).status).toBe(404);
    const byAdmin = await post('admin', `/admin/donation-requests/${id}/accept`);
    expect(byAdmin.status).toBe(409);
    expect(byAdmin.body.error.code).toBe('DONOR_DECISION_REQUIRED');
    expect((await post('donor', `/donation-requests/${id}/accept`)).status).toBe(200);
    await post('donor', `/donation-requests/${id}/handover`, { photos: [photo('donor')] });
    const noReason = await post('admin', `/admin/donation-requests/${id}/confirm-received`, {});
    expect(noReason.status).toBe(422);
    expect(noReason.body.error.code).toBe('REASON_REQUIRED');
    const ok = await post('admin', `/admin/donation-requests/${id}/confirm-received`, {
      reason: 'Người nhận xác nhận qua điện thoại',
    });
    expect(ok.status).toBe(200);
    const actions = (await db().collection('audit_logs').find({}).toArray()).map(
      (log) => log.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['donation.confirm_received']));
    expect(actions).not.toContain('donation.accept');
  });

  it('organization request: Admin files, donor accepts, only an Admin confirms (no photos needed)', async () => {
    const res = await post('admin', '/admin/donation-requests', { toyId, organizationId: orgId });
    expect(res.status).toBe(201);
    const id = res.body.data.id as string;
    expect((await post('donor', `/donation-requests/${id}/accept`)).status).toBe(200);
    await post('donor', `/donation-requests/${id}/handover`, { photos: [photo('donor')] });
    const byDonor = await post('donor', `/donation-requests/${id}/confirm-received`, {
      photos: [photo('donor')],
    });
    expect(byDonor.status).toBe(403);
    const byAdmin = await post('admin', `/admin/donation-requests/${id}/confirm-received`, {});
    expect(byAdmin.status).toBe(200);
    await settle();
    expect((await notesFor('admin2')).length).toBeGreaterThan(0);
  });
});

describe('receipt photos (D-02, GB-20)', () => {
  it('the receiver must send at least one own photo', async () => {
    const id = await shipping();
    const none = await post('receiver', `/donation-requests/${id}/confirm-received`, {});
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('VALIDATION_ERROR');
    const empty = await post('receiver', `/donation-requests/${id}/confirm-received`, {
      photos: [],
    });
    expect(empty.status).toBe(400);
    expect((await requestDoc(id))?.status).toBe('SHIPPING');
    const ok = await post('receiver', `/donation-requests/${id}/confirm-received`, {
      photos: [photo('receiver')],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.handovers.map((h: { step: string }) => h.step)).toEqual([
      'DONOR_SENT',
      'RECEIVER_RECEIVED',
    ]);
  });
});

describe('toy guards (D-01, GB-12)', () => {
  for (const stage of ['ACCEPTED', 'SHIPPING'] as const) {
    it(`blocks hide, delete and edit while a request is ${stage}`, async () => {
      const id = stage === 'ACCEPTED' ? await accepted() : await shipping();
      for (const res of [await hide(), await remove(), await edit()]) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('TOY_HAS_ACTIVE_DONATION');
      }
      expect(await toyStatus()).toBe('RESERVED');
      expect((await requestDoc(id))?.status).toBe(stage);
    });
  }

  it('allows edit, hide and delete again once the request ends', async () => {
    const id = await accepted();
    expect((await hide()).status).toBe(409);
    const cancel = await post('donor', `/donation-requests/${id}/cancel`, { note: 'Bận' });
    expect(cancel.status).toBe(200);
    expect(await toyStatus()).toBe('ACTIVE');
    expect((await edit()).status).not.toBe(409);
    expect((await hide()).status).toBe(200);
    expect(await toyStatus()).toBe('HIDDEN');
    expect((await remove()).status).toBe(204);
  });

  it('the Admin way out still works on a SHIPPING request', async () => {
    const id = await shipping();
    expect((await hide()).status).toBe(409);
    const cancel = await post('admin', `/admin/donation-requests/${id}/cancel`, {
      reason: 'Đồ chơi thất lạc khi gửi',
    });
    expect(cancel.status).toBe(200);
    expect(await toyStatus()).toBe('ACTIVE');
  });

  it('accept racing a hide: exactly one wins and the state stays consistent', async () => {
    for (let round = 0; round < 3; round += 1) {
      await db().collection('donation_requests').deleteMany({});
      await db()
        .collection('toys')
        .updateOne({ _id: oid(toyId) }, { $set: { status: 'ACTIVE' } });
      const id = await create();
      const [acceptRes, hideRes] = await Promise.all([
        post('donor', `/donation-requests/${id}/accept`),
        hide(),
      ]);
      expect([acceptRes.status, hideRes.status].filter((status) => status === 200)).toHaveLength(1);
      const doc = await requestDoc(id);
      if (acceptRes.status === 200) {
        expect(hideRes.body.error.code).toBe('TOY_HAS_ACTIVE_DONATION');
        expect(await toyStatus()).toBe('RESERVED');
        expect(doc?.status).toBe('ACCEPTED');
      } else {
        expect(await toyStatus()).toBe('HIDDEN');
        expect(doc?.status).toBe('REJECTED');
      }
    }
  });

  it('concurrent accepts of two requests: one wins', async () => {
    const a = await create('receiver');
    const b = await create('other');
    const [r1, r2] = await Promise.all([
      post('donor', `/donation-requests/${a}/accept`),
      post('donor', `/donation-requests/${b}/accept`),
    ]);
    expect([r1.status, r2.status].filter((status) => status === 200)).toHaveLength(1);
    expect(await db().collection('donation_requests').countDocuments({ status: 'ACCEPTED' })).toBe(
      1,
    );
  });
});

describe('hiding or deleting a toy closes its PENDING requests (D-06)', () => {
  it('hide: PENDING requests are REJECTED with the reason and the requesters notified', async () => {
    const a = await create('receiver');
    const b = await create('other');
    const org = await post('admin', '/admin/donation-requests', { toyId, organizationId: orgId });
    expect((await hide()).status).toBe(200);
    for (const id of [a, b, org.body.data.id as string]) {
      const doc = await requestDoc(id);
      expect(doc?.status).toBe('REJECTED');
      expect(doc?.rejectReason).toBe('Người quyên góp đã ẩn đồ chơi này.');
      expect(String(doc?.decidedBy)).toBe(ids.donor);
    }
    const history = await db()
      .collection('order_status_history')
      .findOne({ orderId: oid(a), toStatus: 'REJECTED' });
    expect(history?.actor).toMatchObject({ type: 'USER' });
    await settle();
    for (const who of ['receiver', 'other', 'admin2'] as const) {
      const notes = await notesFor(who);
      expect(notes.some((note) => JSON.stringify(note).includes('ẩn đồ chơi'))).toBe(true);
    }
  });

  it('delete: PENDING requests are REJECTED too', async () => {
    const a = await create();
    expect((await remove()).status).toBe(204);
    const doc = await requestDoc(a);
    expect(doc?.status).toBe('REJECTED');
    expect(doc?.rejectReason).toBe('Người quyên góp đã xóa đồ chơi này.');
    await settle();
    const notes = await notesFor('receiver');
    expect(notes.some((note) => JSON.stringify(note).includes('Wooden train set'))).toBe(true);
  });
});

describe('locked donor (D-07, GB-05)', () => {
  it('refuses a request on a toy of a LOCKED donor', async () => {
    await db()
      .collection('users')
      .updateOne({ _id: oid(ids.donor) }, { $set: { status: 'LOCKED' } });
    const res = await post('receiver', '/donation-requests', { toyId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DONOR_LOCKED');
    expect(await db().collection('donation_requests').countDocuments({})).toBe(0);
  });
});

describe('expiry job (D-05, R03 job 9)', () => {
  const backdate = (id: string, field: 'createdAt' | 'decidedAt', at: Date) =>
    db()
      .collection('donation_requests')
      .updateOne({ _id: oid(id) }, { $set: { [field]: at } });

  it('expires PENDING requests after DONATION_PENDING_EXPIRY_DAYS (default 14)', async () => {
    const id = await create();
    const now = new Date();
    await backdate(id, 'createdAt', new Date(now.getTime() - 13 * DAY));
    expect(await expireStaleRequests(now)).toEqual({ expiredPending: 0, expiredAccepted: 0 });
    await backdate(id, 'createdAt', new Date(now.getTime() - 14 * DAY - 1000));
    expect(await expireStaleRequests(now)).toEqual({ expiredPending: 1, expiredAccepted: 0 });
    const doc = await requestDoc(id);
    expect(doc?.status).toBe('CANCELLED');
    expect(doc?.cancellation).toMatchObject({ reason: 'EXPIRED', actorType: 'SYSTEM' });
    const history = await db()
      .collection('order_status_history')
      .findOne({ orderId: oid(id), toStatus: 'CANCELLED' });
    expect(history?.actor).toMatchObject({ type: 'SYSTEM' });
    const audit = await db().collection('audit_logs').findOne({ action: 'donation.expire' });
    expect(audit).toMatchObject({ actorType: 'SYSTEM' });
    await settle();
    expect((await notesFor('receiver')).length).toBeGreaterThan(0);
    // Idempotent: a second run finds nothing.
    expect(await expireStaleRequests(now)).toEqual({ expiredPending: 0, expiredAccepted: 0 });
  });

  it('expires ACCEPTED requests not handed over in DONATION_HANDOVER_EXPIRY_DAYS; toy back to ACTIVE', async () => {
    const id = await accepted();
    const now = new Date();
    await backdate(id, 'decidedAt', new Date(now.getTime() - 15 * DAY));
    expect(await expireStaleRequests(now)).toEqual({ expiredPending: 0, expiredAccepted: 1 });
    expect((await requestDoc(id))?.status).toBe('CANCELLED');
    expect(await toyStatus()).toBe('ACTIVE');
    await settle();
    expect((await notesFor('donor')).length).toBeGreaterThan(0);
    // The toy can be requested again.
    await create('other');
  });

  it('never expires SHIPPING requests; system_settings override the defaults', async () => {
    const shipped = await shipping();
    const farFuture = new Date(Date.now() + 365 * DAY);
    expect(await expireStaleRequests(farFuture)).toEqual({
      expiredPending: 0,
      expiredAccepted: 0,
    });
    expect((await requestDoc(shipped))?.status).toBe('SHIPPING');

    await db().collection('donation_requests').deleteMany({});
    await db()
      .collection('toys')
      .updateOne({ _id: oid(toyId) }, { $set: { status: 'ACTIVE' } });
    await db()
      .collection('system_settings')
      .insertOne({ key: 'DONATION_PENDING_EXPIRY_DAYS', value: 2 });
    const id = await create();
    expect(await expireStaleRequests(new Date(Date.now() + 1 * DAY))).toMatchObject({
      expiredPending: 0,
    });
    expect(await expireStaleRequests(new Date(Date.now() + 3 * DAY))).toMatchObject({
      expiredPending: 1,
    });
    expect((await requestDoc(id))?.status).toBe('CANCELLED');
  });

  it('a concurrent accept and the job: the request ends in one consistent state', async () => {
    const id = await create();
    const later = new Date(Date.now() + 30 * DAY);
    const [acceptRes, result] = await Promise.all([
      post('donor', `/donation-requests/${id}/accept`),
      expireStaleRequests(later),
    ]);
    const doc = await requestDoc(id);
    if (acceptRes.status === 200 && result.expiredPending === 0) {
      expect(doc?.status).toBe('ACCEPTED');
      expect(await toyStatus()).toBe('RESERVED');
    } else {
      expect(doc?.status).toBe('CANCELLED');
      expect(await toyStatus()).toBe('ACTIVE');
    }
  });
});

describe('donor decides (D-04)', () => {
  it('an Admin cannot accept or reject an organization request they filed; the donor can', async () => {
    const res = await post('admin', '/admin/donation-requests', { toyId, organizationId: orgId });
    const id = res.body.data.id as string;
    for (const path of ['accept', 'reject']) {
      const body = path === 'reject' ? { reason: 'Không cần nữa' } : {};
      const byAdmin = await post('admin', `/admin/donation-requests/${id}/${path}`, body);
      expect(byAdmin.status).toBe(409);
      expect(byAdmin.body.error.code).toBe('DONOR_DECISION_REQUIRED');
      // On the user routes the filing Admin is not the donor.
      const onUserRoute = await post('admin', `/donation-requests/${id}/${path}`, body);
      expect(onUserRoute.status).toBe(403);
    }
    expect((await requestDoc(id))?.status).toBe('PENDING');
    expect(await toyStatus()).toBe('ACTIVE');
    expect(await db().collection('audit_logs').countDocuments({ action: 'donation.accept' })).toBe(
      0,
    );
    expect((await post('donor', `/donation-requests/${id}/accept`)).status).toBe(200);
  });

  it('an Admin cannot reject a USER request, nor decide a non-PENDING one, but may cancel', async () => {
    const pending = await create();
    const reject = await post('admin', `/admin/donation-requests/${pending}/reject`, {
      reason: 'Không phù hợp',
    });
    expect(reject.status).toBe(409);
    expect(reject.body.error.code).toBe('DONOR_DECISION_REQUIRED');
    const id = await accepted('other');
    const late = await post('admin', `/admin/donation-requests/${id}/accept`);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    const unknown = await post(
      'admin',
      `/admin/donation-requests/${String(new Types.ObjectId())}/accept`,
    );
    expect(unknown.status).toBe(404);
    const cancel = await post('admin', `/admin/donation-requests/${id}/cancel`, {
      reason: 'Người nhận không liên lạc được',
    });
    expect(cancel.status).toBe(200);
    expect(await toyStatus()).toBe('ACTIVE');
  });
});

describe('contact sharing (D-03)', () => {
  const get = (who: Who, path: string) => request(app).get(`/api/v1${path}`).set(bearer(who));
  const contactOf = async (who: Who, id: string) => {
    const res = await get(who, `/donation-requests/${id}`);
    expect(res.status).toBe(200);
    return res.body.data.counterpartContact as { name: string; phone: string | null } | null;
  };
  const donorContact = { name: 'donor', phone: '+84901000000' };
  const receiverContact = { name: 'receiver', phone: '+84901000001' };

  it('PENDING: no contact for either side; unrelated users get 404', async () => {
    const id = await create();
    expect(await contactOf('donor', id)).toBeNull();
    expect(await contactOf('receiver', id)).toBeNull();
    expect((await get('other', `/donation-requests/${id}`)).status).toBe(404);
  });

  it('ACCEPTED and SHIPPING: donor and receiver see each other (name + full phone, no email)', async () => {
    const id = await accepted();
    expect(await contactOf('donor', id)).toEqual(receiverContact);
    expect(await contactOf('receiver', id)).toEqual(donorContact);
    const incoming = await get('donor', '/donation-requests/incoming');
    expect(incoming.body.data[0].counterpartContact).toEqual(receiverContact);
    const mine = await get('receiver', '/donation-requests/mine');
    expect(mine.body.data[0].counterpartContact).toEqual(donorContact);
    expect(JSON.stringify(mine.body.data)).not.toContain('@lifecycle.example.com');
    expect((await get('other', `/donation-requests/${id}`)).status).toBe(404);

    const shipped = await post('donor', `/donation-requests/${id}/handover`, {
      photos: [photo('donor')],
    });
    expect(shipped.body.data.counterpartContact).toEqual(receiverContact);
    expect(await contactOf('receiver', id)).toEqual(donorContact);

    // Admin view unchanged: masked contacts, no counterpart.
    const admin = await get('admin', `/admin/donation-requests/${id}`);
    expect(admin.body.data.counterpartContact).toBeNull();
    expect(admin.body.data.donor.phone).not.toBe(donorContact.phone);
    expect(admin.body.data.donor.email).toBeDefined();
  });

  it('COMPLETED, CANCELLED and REJECTED: contact hidden again', async () => {
    const done = await shipping();
    await post('receiver', `/donation-requests/${done}/confirm-received`, {
      photos: [photo('receiver')],
    });
    expect(await contactOf('donor', done)).toBeNull();
    expect(await contactOf('receiver', done)).toBeNull();

    // The toy is DONATED now: continue with a fresh one.
    toyId = String(
      (await createToy({ ownerId: oid(ids.donor), listingType: 'DONATION', pricing: {} }))._id,
    );
    const cancelled = await accepted('other');
    expect((await post('other', `/donation-requests/${cancelled}/cancel`, {})).status).toBe(200);
    expect(await contactOf('donor', cancelled)).toBeNull();
    expect(await contactOf('other', cancelled)).toBeNull();

    const rejected = await create('receiver');
    const rej = await post('donor', `/donation-requests/${rejected}/reject`, {
      reason: 'Đã có người nhận',
    });
    expect(rej.status).toBe(200);
    expect(await contactOf('donor', rejected)).toBeNull();
    expect(await contactOf('receiver', rejected)).toBeNull();
  });

  it('organization request: the donor sees the organization; the filing Admin sees nothing on user routes', async () => {
    const res = await post('admin', '/admin/donation-requests', { toyId, organizationId: orgId });
    const id = res.body.data.id as string;
    expect(await contactOf('donor', id)).toBeNull();
    expect((await post('donor', `/donation-requests/${id}/accept`)).status).toBe(200);
    expect(await contactOf('donor', id)).toEqual({ name: 'Org A', phone: '+84901999999' });
    expect(await contactOf('admin', id)).toBeNull();
    const admin = await get('admin', `/admin/donation-requests/${id}`);
    expect(admin.body.data.counterpartContact).toBeNull();
    expect(admin.body.data.organization.contactInfo).toBe('Ms. Lan');
  });
});

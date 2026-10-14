import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuditLogModel } from '../../src/features/audit_logs/audit_logs.model.js';
import { DonationRequestModel } from '../../src/features/donation_requests/donation_requests.model.js';
import {
  adminDonationRequestsRouter,
  donationRequestsRouter,
  donorProfileRouter,
} from '../../src/features/donation_requests/index.js';
import { OrderStatusHistoryModel } from '../../src/features/order_status_history/order_status_history.model.js';
import { OrganizationModel } from '../../src/features/organizations/organizations.model.js';
import { ToyModel } from '../../src/features/toys/toys.model.js';
import { UserModel } from '../../src/features/users/users.model.js';
import {
  domainEvents,
  type DonationStatusChangedEvent,
} from '../../src/shared/events/domain-events.js';
import { errorHandler } from '../../src/shared/middleware/error-handler.js';
import {
  createToy,
  openTransaction,
  pause,
  startRequest,
  useTestDatabase,
} from '../database/helpers.js';

useTestDatabase();

// Test app: the routers of this feature behind a header-based stand-in for the auth middleware.
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = req.header('x-test-user');
  if (userId) req.auth = { userId, role: req.header('x-test-role') === 'ADMIN' ? 'ADMIN' : 'USER' };
  next();
});
app.use('/donation-requests', donationRequestsRouter);
app.use('/admin/donation-requests', adminDonationRequestsRouter);
app.use('/users', donorProfileRouter);
app.use(errorHandler);

let seq = 0;
const createUser = async (role: 'USER' | 'ADMIN' = 'USER') => {
  seq += 1;
  const user = await UserModel.create({
    phone: `+8491${String(seq).padStart(7, '0')}`,
    email: `user${seq}@example.com`,
    passwordHash: 'x',
    fullName: `User ${seq}`,
    role,
  });
  return String(user._id);
};

const as = (userId: string, role: 'USER' | 'ADMIN' = 'USER') => ({
  'x-test-user': userId,
  'x-test-role': role,
});

// A HANDOVER_PHOTO upload of `userId` (public_id signed by the uploads feature).
const photoOf = (userId: string, name = 'p1') => ({
  publicId: `toyflow/handovers/${userId}/${name}`,
  format: 'jpg',
});

let donor: string;
let receiver: string;
let other: string;
let admin: string;
let toyId: string;
let organizationId: string;
let events: DonationStatusChangedEvent[];
let unsubscribe: () => void;

beforeEach(async () => {
  await Promise.all([
    DonationRequestModel.deleteMany({}),
    ToyModel.deleteMany({}),
    UserModel.deleteMany({}),
    OrganizationModel.deleteMany({}),
  ]);
  [donor, receiver, other, admin] = await Promise.all([
    createUser(),
    createUser(),
    createUser(),
    createUser('ADMIN'),
  ]);
  const toy = await createToy({ ownerId: donor, listingType: 'DONATION', pricing: {} });
  toyId = String(toy._id);
  const org = await OrganizationModel.create({
    name: `Org ${seq}`,
    address: '1 Street',
    contactInfo: 'Ms. Lan',
    supportCriteria: 'Children',
  });
  organizationId = String(org._id);
  events = [];
  unsubscribe = domainEvents.subscribe('DONATION_STATUS_CHANGED', (event) => {
    events.push(event);
  });
});

afterEach(() => unsubscribe());

const createRequest = async (userId = receiver) => {
  const res = await request(app).post('/donation-requests').set(as(userId)).send({ toyId });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
};

const toyStatus = async () => (await ToyModel.findById(toyId).lean())?.status;

describe('create', () => {
  it('creates a PENDING request with history', async () => {
    const res = await request(app)
      .post('/donation-requests')
      .set(as(receiver))
      .send({ toyId, message: 'Cho con tôi' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'PENDING', receiverType: 'USER' });
    expect(res.body.data.toy.title).toBe('Wooden train set');
    expect(res.body.data.donor).not.toHaveProperty('phone');
    expect(await OrderStatusHistoryModel.countDocuments({ orderId: res.body.data.id })).toBe(1);
  });

  it('validates, requires sign-in, and refuses own toy / duplicates / non-donation', async () => {
    expect((await request(app).post('/donation-requests').send({ toyId })).status).toBe(401);
    const bad = await request(app)
      .post('/donation-requests')
      .set(as(receiver))
      .send({ toyId: 'x' });
    expect(bad.status).toBe(400);
    const own = await request(app).post('/donation-requests').set(as(donor)).send({ toyId });
    expect(own.body.error.code).toBe('OWN_TOY');
    await createRequest();
    const dup = await request(app).post('/donation-requests').set(as(receiver)).send({ toyId });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DONATION_REQUEST_EXISTS');
    const rent = await createToy();
    const notDonation = await request(app)
      .post('/donation-requests')
      .set(as(receiver))
      .send({ toyId: String(rent._id) });
    expect(notDonation.body.error.code).toBe('TOY_NOT_AVAILABLE');
    const missing = await request(app)
      .post('/donation-requests')
      .set(as(receiver))
      .send({ toyId: '67098e1b34e12c001a123456' });
    expect(missing.status).toBe(404);
  });

  it('lets an Admin request for an ACTIVE organization only (audited)', async () => {
    const ok = await request(app)
      .post('/admin/donation-requests')
      .set(as(admin, 'ADMIN'))
      .send({ toyId, organizationId });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ receiverType: 'ORGANIZATION' });
    expect(await AuditLogModel.countDocuments({ action: 'donation.create' })).toBe(1);

    await OrganizationModel.updateOne({ _id: organizationId }, { status: 'HIDDEN' });
    const other2 = await createUser('ADMIN');
    const hidden = await request(app)
      .post('/admin/donation-requests')
      .set(as(other2, 'ADMIN'))
      .send({ toyId, organizationId });
    expect(hidden.body.error.code).toBe('ORGANIZATION_NOT_AVAILABLE');
    const forbidden = await request(app)
      .post('/admin/donation-requests')
      .set(as(receiver))
      .send({ toyId, organizationId });
    expect(forbidden.status).toBe(403);
  });
});

describe('decisions', () => {
  it('accept reserves the toy and rejects the sibling requests', async () => {
    const mine = await createRequest(receiver);
    const sibling = await createRequest(other);
    const res = await request(app).post(`/donation-requests/${mine}/accept`).set(as(donor));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACCEPTED');
    expect(await toyStatus()).toBe('RESERVED');
    const rejected = await DonationRequestModel.findById(sibling).lean();
    expect(rejected?.status).toBe('REJECTED');
    // Creating a request also publishes an event (no "from"); only the decisions matter here.
    const decisions = events.filter((event) => event.from !== undefined);
    expect(decisions.map((event) => [event.from, event.to])).toEqual([
      ['PENDING', 'ACCEPTED'],
      ['PENDING', 'REJECTED'],
    ]);
    expect(await AuditLogModel.countDocuments({ action: 'donation.accept' })).toBe(0);
  });

  it('only the donor or an Admin decides; others get 403/404', async () => {
    const id = await createRequest();
    expect(
      (await request(app).post(`/donation-requests/${id}/accept`).set(as(receiver))).status,
    ).toBe(403);
    expect((await request(app).post(`/donation-requests/${id}/accept`).set(as(other))).status).toBe(
      404,
    );
    expect((await request(app).get(`/donation-requests/${id}`).set(as(other))).status).toBe(404);
    const reject = await request(app)
      .post(`/admin/donation-requests/${id}/reject`)
      .set(as(admin, 'ADMIN'))
      .send({ reason: 'Không phù hợp tiêu chí' });
    expect(reject.body.data).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Không phù hợp tiêu chí',
    });
    expect(await AuditLogModel.countDocuments({ action: 'donation.reject' })).toBe(1);
    const again = await request(app).post(`/donation-requests/${id}/accept`).set(as(donor));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('reject needs a reason', async () => {
    const id = await createRequest();
    const res = await request(app).post(`/donation-requests/${id}/reject`).set(as(donor)).send({});
    expect(res.status).toBe(400);
  });

  it('two concurrent accepts on one toy: exactly one wins', async () => {
    const a = await createRequest(receiver);
    const b = await createRequest(other);
    const results = await Promise.all([
      request(app).post(`/donation-requests/${a}/accept`).set(as(donor)),
      request(app).post(`/admin/donation-requests/${b}/accept`).set(as(admin, 'ADMIN')),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await DonationRequestModel.countDocuments({ status: 'ACCEPTED' })).toBe(1);
    expect(await toyStatus()).toBe('RESERVED');
  });
});

describe('handover, receipt and cancel', () => {
  const accepted = async () => {
    const id = await createRequest();
    await request(app).post(`/donation-requests/${id}/accept`).set(as(donor));
    return id;
  };

  it('runs the full USER flow and counts the donation on the profile', async () => {
    const id = await accepted();
    const bad = await request(app)
      .post(`/donation-requests/${id}/handover`)
      .set(as(donor))
      .send({ photos: [{ publicId: 'toyflow/toys/x', format: 'jpg' }] });
    expect(bad.status).toBe(400);
    expect(
      (
        await request(app)
          .post(`/donation-requests/${id}/handover`)
          .set(as(receiver))
          .send({ photos: [photoOf(receiver)] })
      ).status,
    ).toBe(403);
    const sent = await request(app)
      .post(`/donation-requests/${id}/handover`)
      .set(as(donor))
      .send({ photos: [photoOf(donor)], note: 'Gửi qua bưu điện' });
    expect(sent.body.data.status).toBe('SHIPPING');
    expect(sent.body.data.handovers[0].step).toBe('DONOR_SENT');

    expect(
      (await request(app).post(`/donation-requests/${id}/cancel`).set(as(receiver)).send({}))
        .status,
    ).toBe(409);
    const done = await request(app)
      .post(`/donation-requests/${id}/confirm-received`)
      .set(as(receiver))
      .send({});
    expect(done.body.data.status).toBe('COMPLETED');
    expect(await toyStatus()).toBe('DONATED');

    const summary = await request(app).get(`/users/${donor}/donation-summary`);
    expect(summary.body.data).toEqual({ userId: donor, completedDonations: 1 });
    expect(
      (await request(app).get('/users/67098e1b34e12c001a123456/donation-summary')).status,
    ).toBe(404);
  });

  it('only an Admin confirms receipt for an organization', async () => {
    const created = await request(app)
      .post('/admin/donation-requests')
      .set(as(admin, 'ADMIN'))
      .send({ toyId, organizationId });
    const id = created.body.data.id as string;
    await request(app).post(`/donation-requests/${id}/accept`).set(as(donor));
    await request(app)
      .post(`/donation-requests/${id}/handover`)
      .set(as(donor))
      .send({ photos: [photoOf(donor)] });
    const done = await request(app)
      .post(`/admin/donation-requests/${id}/confirm-received`)
      .set(as(admin, 'ADMIN'))
      .send({ photos: [photoOf(admin)] });
    expect(done.status).toBe(200);
    expect(done.body.data.handovers).toHaveLength(2);
    expect(done.body.data.donor.phone).toMatch(/\*/);
  });

  it('cancel after accept returns the toy to ACTIVE', async () => {
    const id = await accepted();
    const res = await request(app)
      .post(`/donation-requests/${id}/cancel`)
      .set(as(receiver))
      .send({ note: 'Không cần nữa' });
    expect(res.body.data.cancellation).toMatchObject({ reason: 'CANCELLED_BY_USER' });
    expect(await toyStatus()).toBe('ACTIVE');
  });
});

describe('admin list', () => {
  it('lists with filters and counts; non-admin is 403', async () => {
    const a = await createRequest(receiver);
    await createRequest(other);
    await request(app).post(`/donation-requests/${a}/accept`).set(as(donor));
    const list = await request(app)
      .get('/admin/donation-requests?status=REJECTED&q=wooden')
      .set(as(admin, 'ADMIN'));
    expect(list.body.pagination.totalItems).toBe(1);
    const counts = await request(app)
      .get('/admin/donation-requests/counts')
      .set(as(admin, 'ADMIN'));
    expect(counts.body.data).toMatchObject({ ACCEPTED: 1, REJECTED: 1, PENDING: 0 });
    expect((await request(app).get('/admin/donation-requests').set(as(receiver))).status).toBe(403);
    expect((await request(app).get('/admin/donation-requests')).status).toBe(401);
  });
});

const createOrgRequest = async (adminId = admin, orgId = organizationId) => {
  const res = await request(app)
    .post('/admin/donation-requests')
    .set(as(adminId, 'ADMIN'))
    .send({ toyId, organizationId: orgId });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
};

const shipping = async () => {
  const id = await createRequest();
  await request(app).post(`/donation-requests/${id}/accept`).set(as(donor));
  const sent = await request(app)
    .post(`/donation-requests/${id}/handover`)
    .set(as(donor))
    .send({ photos: [photoOf(donor)] });
  expect(sent.body.data.status).toBe('SHIPPING');
  return id;
};

describe('races on create', () => {
  it('create conflicts with a concurrent accept of the toy (no PENDING left on a RESERVED toy)', async () => {
    // Another request's accept has reserved the toy but not committed yet.
    const accept = await openTransaction((session) =>
      ToyModel.updateOne({ _id: toyId, status: 'ACTIVE' }, { status: 'RESERVED' }, { session }),
    );
    const creating = startRequest(
      request(app).post('/donation-requests').set(as(receiver)).send({ toyId }),
    );
    await pause(300);
    await accept.commit();
    const res = await creating;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TOY_NOT_AVAILABLE');
    expect(await DonationRequestModel.countDocuments({ status: 'PENDING' })).toBe(0);
  });

  it('create conflicts with a concurrent delete or hide of the organization', async () => {
    const remove = await openTransaction((session) =>
      OrganizationModel.deleteOne({ _id: organizationId }, { session }),
    );
    const creating = startRequest(
      request(app)
        .post('/admin/donation-requests')
        .set(as(admin, 'ADMIN'))
        .send({ toyId, organizationId }),
    );
    await pause(300);
    await remove.commit();
    const res = await creating;
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORGANIZATION_NOT_FOUND');
    expect(await DonationRequestModel.countDocuments({})).toBe(0);

    const org = await OrganizationModel.create({
      name: 'Org hide race',
      address: '1 Street',
      contactInfo: 'Ms. Lan',
      supportCriteria: 'Children',
    });
    const hide = await openTransaction((session) =>
      OrganizationModel.updateOne(
        { _id: org._id, status: 'ACTIVE' },
        { status: 'HIDDEN' },
        { session },
      ),
    );
    const creatingHidden = startRequest(
      request(app)
        .post('/admin/donation-requests')
        .set(as(admin, 'ADMIN'))
        .send({ toyId, organizationId: String(org._id) }),
    );
    await pause(300);
    await hide.commit();
    const hidden = await creatingHidden;
    expect(hidden.status).toBe(409);
    expect(hidden.body.error.code).toBe('ORGANIZATION_NOT_AVAILABLE');
  });
});

describe('organization requests', () => {
  it('lets one Admin file for several organizations, but one PENDING per organization', async () => {
    const second = await OrganizationModel.create({
      name: 'Second org',
      address: '2 Street',
      contactInfo: 'Mr. Nam',
      supportCriteria: 'Children',
    });
    await createOrgRequest(admin, organizationId);
    await createOrgRequest(admin, String(second._id));
    const otherAdmin = await createUser('ADMIN');
    const dup = await request(app)
      .post('/admin/donation-requests')
      .set(as(otherAdmin, 'ADMIN'))
      .send({ toyId, organizationId });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DONATION_REQUEST_EXISTS');
  });

  it('are acted on through the admin routes only, and are not in "mine"', async () => {
    const id = await createOrgRequest();
    // The filing Admin on the user route: no unaudited CANCELLED_BY_USER.
    const userCancel = await request(app)
      .post(`/donation-requests/${id}/cancel`)
      .set(as(admin, 'ADMIN'))
      .send({});
    expect(userCancel.status).toBe(403);
    const mine = await request(app).get('/donation-requests/mine').set(as(admin, 'ADMIN'));
    expect(mine.body.pagination.totalItems).toBe(0);

    const adminCancel = await request(app)
      .post(`/admin/donation-requests/${id}/cancel`)
      .set(as(admin, 'ADMIN'))
      .send({ reason: 'Tổ chức không cần nữa' });
    expect(adminCancel.status).toBe(200);
    expect(adminCancel.body.data.cancellation).toMatchObject({ reason: 'CANCELLED_BY_ADMIN' });
    expect(await AuditLogModel.countDocuments({ action: 'donation.cancel' })).toBe(1);
  });
});

describe('handover and receipt validation', () => {
  const accepted = async () => {
    const id = await createRequest();
    await request(app).post(`/donation-requests/${id}/accept`).set(as(donor));
    return id;
  };

  it("accepts only the caller's own HANDOVER_PHOTO uploads", async () => {
    const id = await accepted();
    const send = (body: object) =>
      request(app).post(`/donation-requests/${id}/handover`).set(as(donor)).send(body);
    expect((await send({})).status).toBe(400);
    expect((await send({ photos: [] })).status).toBe(400);
    expect(
      (await send({ photos: [{ publicId: 'toyflow/handovers/../x', format: 'jpg' }] })).status,
    ).toBe(400);
    const foreign = await send({ photos: [photoOf(receiver)] });
    expect(foreign.status).toBe(422);
    expect(foreign.body.error.code).toBe('HANDOVER_PHOTO_NOT_OWNED');
    expect((await DonationRequestModel.findById(id).lean())?.status).toBe('ACCEPTED');
  });

  it('confirms receipt without photos; only the receiver, and photos must be theirs', async () => {
    const id = await shipping();
    expect(
      (await request(app).post(`/donation-requests/${id}/confirm-received`).set(as(donor)).send({}))
        .status,
    ).toBe(403);
    const foreign = await request(app)
      .post(`/donation-requests/${id}/confirm-received`)
      .set(as(receiver))
      .send({ photos: [photoOf(donor)] });
    expect(foreign.body.error.code).toBe('HANDOVER_PHOTO_NOT_OWNED');
    const done = await request(app)
      .post(`/donation-requests/${id}/confirm-received`)
      .set(as(receiver))
      .send({ photos: [photoOf(receiver)] });
    expect(done.body.data.status).toBe('COMPLETED');
    expect(done.body.data.handovers.map((h: { step: string }) => h.step)).toEqual([
      'DONOR_SENT',
      'RECEIVER_RECEIVED',
    ]);
  });
});

describe('stuck SHIPPING: the Admin way out', () => {
  it('users cannot cancel a SHIPPING request; an Admin can, with a reason (toy back to ACTIVE)', async () => {
    const id = await shipping();
    const user = await request(app)
      .post(`/donation-requests/${id}/cancel`)
      .set(as(donor))
      .send({ note: 'Thôi' });
    expect(user.status).toBe(409);
    expect(user.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    const noReason = await request(app)
      .post(`/admin/donation-requests/${id}/cancel`)
      .set(as(admin, 'ADMIN'))
      .send({});
    expect(noReason.status).toBe(400);

    const res = await request(app)
      .post(`/admin/donation-requests/${id}/cancel`)
      .set(as(admin, 'ADMIN'))
      .send({ reason: 'Đồ chơi thất lạc khi gửi' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.cancellation).toMatchObject({
      reason: 'CANCELLED_BY_ADMIN',
      note: 'Đồ chơi thất lạc khi gửi',
    });
    expect(await toyStatus()).toBe('ACTIVE');
    const audit = await AuditLogModel.findOne({ action: 'donation.cancel' }).lean();
    expect(audit?.meta).toMatchObject({
      before: { status: 'SHIPPING' },
      after: { status: 'CANCELLED' },
      reason: 'Đồ chơi thất lạc khi gửi',
    });
  });

  it('an Admin confirms receipt for a USER receiver only with a reason (audited)', async () => {
    const id = await shipping();
    const noReason = await request(app)
      .post(`/admin/donation-requests/${id}/confirm-received`)
      .set(as(admin, 'ADMIN'))
      .send({});
    expect(noReason.status).toBe(422);
    expect(noReason.body.error.code).toBe('REASON_REQUIRED');
    const res = await request(app)
      .post(`/admin/donation-requests/${id}/confirm-received`)
      .set(as(admin, 'ADMIN'))
      .send({ reason: 'Người nhận xác nhận qua điện thoại' });
    expect(res.body.data.status).toBe('COMPLETED');
    expect(await toyStatus()).toBe('DONATED');
    const audit = await AuditLogModel.findOne({ action: 'donation.confirm_received' }).lean();
    expect(audit?.meta).toMatchObject({ adminReason: 'Người nhận xác nhận qua điện thoại' });
  });
});

describe('admin list filters and donor summary', () => {
  it('filters the counts by receiver type, organization and q; rejects unknown params', async () => {
    await createRequest(receiver);
    await createOrgRequest();
    const counts = (query: string) =>
      request(app).get(`/admin/donation-requests/counts${query}`).set(as(admin, 'ADMIN'));
    expect((await counts('?receiverType=ORGANIZATION')).body.data).toMatchObject({ PENDING: 1 });
    expect((await counts(`?organizationId=${organizationId}`)).body.data.PENDING).toBe(1);
    expect((await counts('?q=wooden')).body.data.PENDING).toBe(2);
    expect((await counts('?q=nothing-like-this')).body.data.PENDING).toBe(0);
    expect((await counts('?search=wooden')).status).toBe(400);
    const list = (query: string) =>
      request(app).get(`/admin/donation-requests${query}`).set(as(admin, 'ADMIN'));
    expect((await list('?sortBy=code&sortOrder=asc')).status).toBe(200);
    expect((await list('?sortBy=password')).status).toBe(400);
    expect((await request(app).get('/donation-requests/mine?foo=1').set(as(receiver))).status).toBe(
      400,
    );
  });

  it('returns 0 for a donor without completed donations and 400 for a bad id', async () => {
    const summary = await request(app).get(`/users/${other}/donation-summary`);
    expect(summary.body.data).toEqual({ userId: other, completedDonations: 0 });
    expect((await request(app).get('/users/not-an-id/donation-summary')).status).toBe(400);
  });
});

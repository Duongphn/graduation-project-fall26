import express from 'express';
import mongoose, { type ClientSession } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuditLog } from '../../src/models/audit-log.model.js';
import { DonationRequest } from '../../src/models/donation-request.model.js';
import {
  adminDonationRequestsRouter,
  donationRequestsRouter,
  donorProfileRouter,
} from '../../src/routes/donation-request.routes.js';
import { Organization } from '../../src/models/organization.model.js';
import { Toy } from '../../src/models/toy.model.js';
import { User } from '../../src/models/user.model.js';
import {
  domainEvents,
  type DonationStatusChangedEvent,
} from '../../src/utils/domain-events.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { testAuth } from '../support/test-auth.js';
import { newId, pause, useTestDatabase } from '../support/test-database.js';

// The category of the test toys; the test organizations take it (GB-53).
const TOY_CATEGORY = newId();

/** A toy on develop's schema: a donation post ('donate', free) unless overridden. */
const createToy = (overrides: Record<string, unknown> = {}) =>
  Toy.create({
    ownerId: newId(),
    categoryId: TOY_CATEGORY,
    title: 'Wooden train set',
    description: 'Complete set with 20 pieces.',
    condition: 'good',
    listingType: 'donate',
    priceOrRate: 0,
    status: 'active',
    ageRange: { minAge: 3, maxAge: 6 },
    images: [{ url: 'https://example.com/1.jpg', publicId: 'toyflow/toys/1' }],
    quantity: 1,
    ...overrides,
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

/** Starts a supertest request now (supertest is lazy) and resolves with its response. */
const startRequest = <T>(test: PromiseLike<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    test.then(resolve, reject);
  });

useTestDatabase();

// GB-51: an organization takes requests through its receiving point (both methods here).
const RECEIVING_POINT = {
  province: 'Hà Nội',
  ward: 'Phường Ba Đình',
  street: '1 Hoàng Hoa Thám',
  openingHours: '8:00 – 17:00',
  contactName: 'Nguyễn Văn Nam',
  contactPhone: '+84987654321',
  acceptsDropOff: true,
  acceptsParcel: true,
};

// Test app: the routers of this feature behind a header-based stand-in for the auth middleware.
const app = express();
app.use(express.json());
app.use(testAuth);
app.use('/donation-requests', donationRequestsRouter);
app.use('/admin/donation-requests', adminDonationRequestsRouter);
app.use('/donors', donorProfileRouter);
app.use(errorHandler);

let seq = 0;
const createUser = async (role: 'USER' | 'ADMIN' = 'USER') => {
  seq += 1;
  const user = await User.create({
    phone: `+8491${String(seq).padStart(7, '0')}`,
    email: `user${seq}@example.com`,
    passwordHash: 'x',
    fullName: `User ${seq}`,
    role,
    // GB-06: Donors and Receivers are verified Users.
    verificationStatus: 'verified',
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
    DonationRequest.deleteMany({}),
    Toy.deleteMany({}),
    User.deleteMany({}),
    Organization.deleteMany({}),
  ]);
  [donor, receiver, other, admin] = await Promise.all([
    createUser(),
    createUser(),
    createUser(),
    createUser('ADMIN'),
  ]);
  const toy = await createToy({ ownerId: donor });
  toyId = String(toy._id);
  const org = await Organization.create({
    name: `Org ${seq}`,
    address: '1 Street',
    contact_info: 'Ms. Lan',
    support_criteria: 'Children',
    receivingPoint: RECEIVING_POINT,
    categoryIds: [TOY_CATEGORY],
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

const toyStatus = async () => (await Toy.findById(toyId).lean())?.status;

describe('create', () => {
  it('creates a PENDING request with history', async () => {
    const res = await request(app)
      .post('/donation-requests')
      .set(as(receiver))
      .send({ toyId, message: 'Cho con tôi' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'pending', receiverType: 'USER' });
    expect(res.body.data.toy.title).toBe('Wooden train set');
    expect(res.body.data.donor).not.toHaveProperty('phone');
    expect(res.body.data.history).toHaveLength(1);
    expect(res.body.data.message).toBe('Cho con tôi');
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
    const rent = await createToy({ listingType: 'rent', priceOrRate: 20_000 });
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

  // GB-06, R03 actors: a Receiver is a verified User; the same 403 as the other blocked actions.
  it('refuses a user whose identity is not verified (403 USER_NOT_VERIFIED)', async () => {
    for (const status of ['unverified', 'pending', 'rejected']) {
      await User.updateOne({ _id: receiver }, { $set: { verificationStatus: status } });
      const res = await request(app).post('/donation-requests').set(as(receiver)).send({ toyId });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('USER_NOT_VERIFIED');
    }
    await User.updateOne({ _id: donor }, { $set: { verificationStatus: 'unverified' } });
    const toOrganization = await request(app)
      .post('/donation-requests/to-organization')
      .set(as(donor))
      .send({ toyId, organizationId, handoverMethod: 'drop_off' });
    expect(toOrganization.body.error.code).toBe('USER_NOT_VERIFIED');
    expect(await DonationRequest.countDocuments({})).toBe(0);
    await User.updateMany({}, { $set: { verificationStatus: 'verified' } });
  });

  it('lets an Admin request for an ACTIVE organization only (audited)', async () => {
    const ok = await request(app)
      .post('/admin/donation-requests')
      .set(as(admin, 'ADMIN'))
      .send({ toyId, organizationId });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ receiverType: 'ORGANIZATION' });
    expect(await AuditLog.countDocuments({ action: 'donation.create' })).toBe(1);

    await Organization.updateOne({ _id: organizationId }, { status: 'hidden' });
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

  it('GB-55: no new request for an organization that is not accepting toys; pending ones go on', async () => {
    const pending = await request(app)
      .post('/admin/donation-requests')
      .set(as(admin, 'ADMIN'))
      .send({ toyId, organizationId });
    expect(pending.status).toBe(201);
    await Organization.updateOne({ _id: organizationId }, { isAccepting: false });

    const second = await createToy({ ownerId: donor });
    const refused = await request(app)
      .post('/admin/donation-requests')
      .set(as(admin, 'ADMIN'))
      .send({ toyId: String(second._id), organizationId });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ORGANIZATION_NOT_ACCEPTING');

    const accepted = await request(app)
      .post(`/donation-requests/${pending.body.data.id as string}/accept`)
      .set(as(donor));
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe('accepted');
  });
});

describe('decisions', () => {
  it('accept reserves the toy and rejects the sibling requests', async () => {
    const mine = await createRequest(receiver);
    const sibling = await createRequest(other);
    const res = await request(app).post(`/donation-requests/${mine}/accept`).set(as(donor));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('accepted');
    expect(await toyStatus()).toBe('hidden');
    const rejected = await DonationRequest.findById(sibling).lean();
    expect(rejected?.status).toBe('rejected');
    // Creating a request also publishes an event (no "from"); only the decisions matter here.
    const decisions = events.filter((event) => event.from !== undefined);
    expect(decisions.map((event) => [event.from, event.to])).toEqual([
      ['pending', 'accepted'],
      ['pending', 'rejected'],
    ]);
    expect(await AuditLog.countDocuments({ action: 'donation.accept' })).toBe(0);
  });

  it("GB-56: the Donor decides a Receiver's request; others get 403/404, an Admin 409", async () => {
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
    expect(reject.status).toBe(409);
    expect(reject.body.error.code).toBe('DONOR_DECISION_REQUIRED');
    expect(await AuditLog.countDocuments({ action: 'donation.reject' })).toBe(0);
    const byDonor = await request(app)
      .post(`/donation-requests/${id}/reject`)
      .set(as(donor))
      .send({ reason: 'Không phù hợp tiêu chí' });
    expect(byDonor.body.data).toMatchObject({
      status: 'rejected',
      rejectReason: 'Không phù hợp tiêu chí',
    });
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
      request(app).post(`/donation-requests/${b}/accept`).set(as(donor)),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await DonationRequest.countDocuments({ status: 'accepted' })).toBe(1);
    expect(await toyStatus()).toBe('hidden');
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
      .send({ handoverMethod: 'drop_off', photos: [{ publicId: 'toyflow/toys/x', format: 'jpg' }] });
    expect(bad.status).toBe(400);
    expect(
      (
        await request(app)
          .post(`/donation-requests/${id}/handover`)
          .set(as(receiver))
          .send({ handoverMethod: 'drop_off', photos: [photoOf(receiver)] })
      ).status,
    ).toBe(403);
    const sent = await request(app)
      .post(`/donation-requests/${id}/handover`)
      .set(as(donor))
      .send({ handoverMethod: 'drop_off', photos: [photoOf(donor)], note: 'Gửi qua bưu điện' });
    expect(sent.body.data.status).toBe('shipping');
    expect(sent.body.data.handovers[0].step).toBe('DONOR_SENT');

    expect(
      (await request(app).post(`/donation-requests/${id}/cancel`).set(as(receiver)).send({}))
        .status,
    ).toBe(409);
    const done = await request(app)
      .post(`/donation-requests/${id}/confirm-received`)
      .set(as(receiver))
      .send({ photos: [photoOf(receiver)] });
    expect(done.body.data.status).toBe('completed');
    expect(await toyStatus()).toBe('hidden');

    const summary = await request(app).get(`/donors/${donor}/donation-summary`);
    expect(summary.body.data).toEqual({ userId: donor, completedDonations: 1 });
    expect(
      (await request(app).get('/donors/67098e1b34e12c001a123456/donation-summary')).status,
    ).toBe(404);
  });

  it('GB-59: the Admin records who confirmed, the channel, the date and a photo for an organization', async () => {
    const created = await request(app)
      .post('/admin/donation-requests')
      .set(as(admin, 'ADMIN'))
      .send({ toyId, organizationId });
    const id = created.body.data.id as string;
    await request(app).post(`/donation-requests/${id}/accept`).set(as(donor));
    await request(app)
      .post(`/donation-requests/${id}/handover`)
      .set(as(donor))
      .send({ handoverMethod: 'drop_off', photos: [photoOf(donor)] });
    const confirm = (body: object) =>
      request(app)
        .post(`/admin/donation-requests/${id}/confirm-received`)
        .set(as(admin, 'ADMIN'))
        .send(body);
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const receipt = { confirmedBy: 'Chị Lan', channel: 'phone', receivedAt: today };

    const noDetails = await confirm({ photos: [photoOf(admin)] });
    expect(noDetails.status).toBe(422);
    expect(noDetails.body.error.code).toBe('RECEIPT_DETAILS_REQUIRED');
    const noPhoto = await confirm(receipt);
    expect(noPhoto.status).toBe(422);
    expect(noPhoto.body.error.code).toBe('RECEIPT_PHOTO_REQUIRED');
    for (const receivedAt of ['2099-01-01', '2020-01-01']) {
      const badDate = await confirm({ ...receipt, receivedAt, photos: [photoOf(admin)] });
      expect(badDate.body.error.code).toBe('RECEIVED_AT_INVALID');
    }
    expect((await confirm({ ...receipt, channel: 'zalo', photos: [photoOf(admin)] })).status).toBe(
      400,
    );
    expect((await DonationRequest.findById(id).lean())?.status).toBe('shipping');

    const done = await confirm({ ...receipt, photos: [photoOf(admin)] });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({
      status: 'completed',
      receipt: { confirmedBy: 'Chị Lan', channel: 'phone' },
    });
    expect(done.body.data.receipt.receivedAt).toBe(
      new Date(`${today}T00:00:00+07:00`).toISOString(),
    );
    expect(done.body.data.handovers).toHaveLength(2);
    expect(done.body.data.donor.phone).toMatch(/\*/);
    const stored = await DonationRequest.findById(id).lean();
    expect(stored).toMatchObject({ confirmedBy: 'Chị Lan', channel: 'phone' });
    // MSG55 carries the received date the Admin entered.
    expect(events.find((event) => event.to === 'completed')?.receivedAt).toBe(
      new Date(`${today}T00:00:00+07:00`).toISOString(),
    );
  });

  // MSG54: the accepted notice names the handover deadline.
  it('puts the handover deadline on the accepted event', async () => {
    const sent = await request(app)
      .post('/donation-requests/to-organization')
      .set(as(donor))
      .send({ toyId, organizationId, handoverMethod: 'carrier' });
    expect(sent.status).toBe(201);
    const id = sent.body.data.id as string;
    const accepted = await request(app)
      .post(`/admin/donation-requests/${id}/accept`)
      .set(as(admin, 'ADMIN'));
    expect(accepted.status).toBe(200);
    const stored = await DonationRequest.findById(id).lean();
    expect(stored?.timer?.dueAt).toBeInstanceOf(Date);
    expect(events.find((event) => event.to === 'accepted')?.handoverDueAt).toBe(
      stored?.timer?.dueAt?.toISOString(),
    );
  });

  it('cancel after accept returns the toy to ACTIVE', async () => {
    const id = await accepted();
    const res = await request(app)
      .post(`/donation-requests/${id}/cancel`)
      .set(as(receiver))
      .send({ note: 'Không cần nữa' });
    expect(res.body.data.cancellation).toMatchObject({ reason: 'CANCELLED_BY_USER' });
    expect(await toyStatus()).toBe('active');
  });
});

describe('admin list', () => {
  it('lists with filters and counts; non-admin is 403', async () => {
    const a = await createRequest(receiver);
    await createRequest(other);
    await request(app).post(`/donation-requests/${a}/accept`).set(as(donor));
    const list = await request(app)
      .get('/admin/donation-requests?status=rejected&q=wooden')
      .set(as(admin, 'ADMIN'));
    expect(list.body.pagination.totalItems).toBe(1);
    const counts = await request(app)
      .get('/admin/donation-requests/counts')
      .set(as(admin, 'ADMIN'));
    expect(counts.body.data).toMatchObject({ accepted: 1, rejected: 1, pending: 0 });
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
    .send({ handoverMethod: 'drop_off', photos: [photoOf(donor)] });
  expect(sent.body.data.status).toBe('shipping');
  return id;
};

// GB-51, UC40 2.1: an organization saved before receiving points existed takes no request.
describe('organization without a receiving point', () => {
  it('refuses the Admin and the Donor (409 ORGANIZATION_NO_RECEIVING_POINT)', async () => {
    await Organization.updateOne({ _id: organizationId }, { $unset: { receivingPoint: 1 } });
    const byAdmin = await request(app)
      .post('/admin/donation-requests')
      .set(as(admin, 'ADMIN'))
      .send({ toyId, organizationId });
    expect(byAdmin.status).toBe(409);
    expect(byAdmin.body.error.code).toBe('ORGANIZATION_NO_RECEIVING_POINT');
    const byDonor = await request(app)
      .post('/donation-requests/to-organization')
      .set(as(donor))
      .send({ toyId, organizationId, handoverMethod: 'carrier' });
    expect(byDonor.status).toBe(409);
    expect(byDonor.body.error.code).toBe('ORGANIZATION_NO_RECEIVING_POINT');
    expect(await DonationRequest.countDocuments({})).toBe(0);
    expect(events).toHaveLength(0);
  });
});

// UC35 1.1, GB-53/GB-54: the Admin asks for a post for an organization that takes its category.
describe('Admin request for an organization that does not take the category', () => {
  it('is refused (422 ORGANIZATION_CATEGORY_NOT_ACCEPTED)', async () => {
    await Organization.updateOne({ _id: organizationId }, { $set: { categoryIds: [newId()] } });
    const res = await request(app)
      .post('/admin/donation-requests')
      .set(as(admin, 'ADMIN'))
      .send({ toyId, organizationId });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ORGANIZATION_CATEGORY_NOT_ACCEPTED');
    expect(res.body.error.details).toEqual([
      { field: 'organizationId', message: 'Chọn tổ chức nhận danh mục của đồ chơi.' },
    ]);
    expect(await DonationRequest.countDocuments({})).toBe(0);

    await Organization.updateOne({ _id: organizationId }, { $unset: { categoryIds: 1 } });
    const noNeeds = await request(app)
      .post('/admin/donation-requests')
      .set(as(admin, 'ADMIN'))
      .send({ toyId, organizationId });
    expect(noNeeds.body.error.code).toBe('ORGANIZATION_CATEGORY_NOT_ACCEPTED');
  });
});

describe('races on create', () => {
  it('create conflicts with a concurrent accept of the toy (no PENDING left on a RESERVED toy)', async () => {
    // Another request's accept has reserved the toy but not committed yet.
    const accept = await openTransaction((session) =>
      Toy.updateOne({ _id: toyId, status: 'active' }, { status: 'hidden' }, { session }),
    );
    const creating = startRequest(
      request(app).post('/donation-requests').set(as(receiver)).send({ toyId }),
    );
    await pause(300);
    await accept.commit();
    const res = await creating;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TOY_NOT_AVAILABLE');
    expect(await DonationRequest.countDocuments({ status: 'pending' })).toBe(0);
  });

  it('create conflicts with a concurrent delete or hide of the organization', async () => {
    const remove = await openTransaction((session) =>
      Organization.deleteOne({ _id: organizationId }, { session }),
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
    expect(await DonationRequest.countDocuments({})).toBe(0);

    const org = await Organization.create({
      name: 'Org hide race',
      address: '1 Street',
      contact_info: 'Ms. Lan',
      support_criteria: 'Children',
      receivingPoint: RECEIVING_POINT,
      categoryIds: [TOY_CATEGORY],
    });
    const hide = await openTransaction((session) =>
      Organization.updateOne({ _id: org._id, status: 'active' }, { status: 'hidden' }, { session }),
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

describe('Donor to organization (UC33, GB-56)', () => {
  // MSG52: the Donor's request names a handover method (drop-off unless the test says otherwise).
  const sendToOrganization = (body: object, userId = donor) =>
    request(app)
      .post('/donation-requests/to-organization')
      .set(as(userId))
      .send({ handoverMethod: 'drop_off', ...body });

  const withPoint = (overrides: Record<string, unknown> = {}) =>
    Organization.updateOne(
      { _id: organizationId },
      {
        receivingPoint: {
          province: 'Hà Nội',
          ward: 'Phường Ba Đình',
          street: '1 Hoàng Hoa Thám',
          openingHours: '8:00 – 17:00',
          contactName: 'Nguyễn Văn Nam',
          contactPhone: '+84987654321',
          acceptsDropOff: true,
          acceptsParcel: false,
          ...overrides,
        },
      },
    );

  it('creates a PENDING request the Admin decides; the Donor cannot (409)', async () => {
    const res = await sendToOrganization({ toyId, organizationId, message: 'Còn đủ 20 chi tiết' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'pending',
      receiverType: 'ORGANIZATION',
      decider: 'ADMIN',
      message: 'Còn đủ 20 chi tiết',
    });
    const id = res.body.data.id as string;
    const stored = await DonationRequest.findById(id).lean();
    expect(String(stored?.requestedBy)).toBe(donor);
    expect(String(stored?.receiver?.organizationId)).toBe(organizationId);

    const byDonor = await request(app).post(`/donation-requests/${id}/accept`).set(as(donor));
    expect(byDonor.status).toBe(409);
    expect(byDonor.body.error.code).toBe('ADMIN_DECISION_REQUIRED');
    const rejectByDonor = await request(app)
      .post(`/donation-requests/${id}/reject`)
      .set(as(donor))
      .send({ reason: 'Không muốn tặng nữa' });
    expect(rejectByDonor.body.error.code).toBe('ADMIN_DECISION_REQUIRED');

    const accepted = await request(app)
      .post(`/admin/donation-requests/${id}/accept`)
      .set(as(admin, 'ADMIN'));
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.status).toBe('accepted');
    expect(await toyStatus()).toBe('hidden');
    expect(await AuditLog.countDocuments({ action: 'donation.accept', target_id: id })).toBe(1);

    // The status history shows who acted: the Donor created it, the Admin accepted it.
    const detail = await request(app).get(`/admin/donation-requests/${id}`).set(as(admin, 'ADMIN'));
    expect(
      detail.body.data.history.map((row: { toStatus: string; actorType: string }) => [
        row.toStatus,
        row.actorType,
      ]),
    ).toEqual([
      ['pending', 'USER'],
      ['accepted', 'ADMIN'],
    ]);
  });

  it('lets the Admin reject it with a reason, and the Donor choose another organization', async () => {
    const res = await sendToOrganization({ toyId, organizationId });
    const id = res.body.data.id as string;
    const noReason = await request(app)
      .post(`/admin/donation-requests/${id}/reject`)
      .set(as(admin, 'ADMIN'))
      .send({});
    expect(noReason.status).toBe(400);
    const rejected = await request(app)
      .post(`/admin/donation-requests/${id}/reject`)
      .set(as(admin, 'ADMIN'))
      .send({ reason: 'Tổ chức đã đủ đồ chơi loại này' });
    expect(rejected.body.data).toMatchObject({
      status: 'rejected',
      rejectReason: 'Tổ chức đã đủ đồ chơi loại này',
    });
    expect(await toyStatus()).toBe('active');
    expect((await sendToOrganization({ toyId, organizationId })).status).toBe(201);
  });

  it("keeps the Donor's decision on the Admin's request for an organization (409 for the Admin)", async () => {
    const id = await createOrgRequest();
    const byAdmin = await request(app)
      .post(`/admin/donation-requests/${id}/accept`)
      .set(as(admin, 'ADMIN'));
    expect(byAdmin.status).toBe(409);
    expect(byAdmin.body.error.code).toBe('DONOR_DECISION_REQUIRED');
    const detail = await request(app).get(`/donation-requests/${id}`).set(as(donor));
    expect(detail.body.data.decider).toBe('DONOR');
    expect(
      (await request(app).post(`/donation-requests/${id}/accept`).set(as(donor))).status,
    ).toBe(200);
  });

  it("only from the Donor's own Active post, to an accepting organization (GB-55, MSG51)", async () => {
    expect((await sendToOrganization({ toyId, organizationId }, receiver)).status).toBe(403);
    const pendingPost = await createToy({ ownerId: donor, status: 'pending' });
    const notActive = await sendToOrganization({ toyId: String(pendingPost._id), organizationId });
    expect(notActive.body.error.code).toBe('TOY_NOT_AVAILABLE');

    await Organization.updateOne({ _id: organizationId }, { isAccepting: false });
    const closed = await sendToOrganization({ toyId, organizationId });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('ORGANIZATION_NOT_ACCEPTING');
    await Organization.updateOne({ _id: organizationId }, { isAccepting: true, status: 'hidden' });
    expect((await sendToOrganization({ toyId, organizationId })).body.error.code).toBe(
      'ORGANIZATION_NOT_AVAILABLE',
    );
    expect(await DonationRequest.countDocuments({})).toBe(0);
  });

  it('limits the note to 300 characters and the method to what the receiving point accepts', async () => {
    await withPoint();
    const long = await sendToOrganization({ toyId, organizationId, message: 'a'.repeat(301) });
    expect(long.status).toBe(400);
    const parcel = await sendToOrganization({ toyId, organizationId, handoverMethod: 'carrier' });
    expect(parcel.status).toBe(422);
    expect(parcel.body.error.code).toBe('HANDOVER_METHOD_NOT_ALLOWED');
    const ok = await sendToOrganization({
      toyId,
      organizationId,
      message: 'a'.repeat(300),
      handoverMethod: 'drop_off',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data.handoverMethod).toBe('drop_off');
    // One pending request per toy and organization.
    expect((await sendToOrganization({ toyId, organizationId })).body.error.code).toBe(
      'DONATION_REQUEST_EXISTS',
    );
  });

  it('checks the handover method against the receiving point; shows its contact once accepted', async () => {
    await withPoint({ acceptsDropOff: false, acceptsParcel: true });
    for (const handoverMethod of [undefined, '', 'DROP_OFF', 'post']) {
      const wrong = await sendToOrganization({ toyId, organizationId, handoverMethod });
      expect(wrong.status, String(handoverMethod)).toBe(400);
      expect(wrong.body.error.code).toBe('VALIDATION_ERROR');
    }
    const res = await sendToOrganization({ toyId, organizationId, handoverMethod: 'carrier' });
    const id = res.body.data.id as string;
    expect(res.body.data.organization.receivingPoint).toMatchObject({ province: 'Hà Nội' });
    expect(JSON.stringify(res.body.data)).not.toContain('987654321');
    expect(res.body.data.counterpartContact).toBeNull();
    await request(app).post(`/admin/donation-requests/${id}/accept`).set(as(admin, 'ADMIN'));

    const detail = await request(app).get(`/donation-requests/${id}`).set(as(donor));
    expect(detail.body.data.counterpartContact).toEqual({
      name: 'Nguyễn Văn Nam',
      phone: '+84987654321',
    });
    const dropOff = await request(app)
      .post(`/donation-requests/${id}/handover`)
      .set(as(donor))
      .send({ handoverMethod: 'drop_off', photos: [photoOf(donor)] });
    expect(dropOff.status).toBe(422);
    expect(dropOff.body.error.code).toBe('HANDOVER_METHOD_NOT_ALLOWED');
    const sent = await request(app)
      .post(`/donation-requests/${id}/handover`)
      .set(as(donor))
      .send({ handoverMethod: 'carrier', trackingCode: 'VTP-1', photos: [photoOf(donor)] });
    expect(sent.body.data).toMatchObject({ status: 'shipping', handoverMethod: 'carrier' });
  });

  it('publishes the new request with the Donor as its creator', async () => {
    await sendToOrganization({ toyId, organizationId });
    expect(events.at(-1)).toMatchObject({
      to: 'pending',
      receiverType: 'ORGANIZATION',
      donorId: donor,
      requestedBy: donor,
      changedBy: donor,
    });
  });
});

describe('organization requests', () => {
  it('lets one Admin file for several organizations, but one PENDING per organization', async () => {
    const second = await Organization.create({
      name: 'Second org',
      address: '2 Street',
      contact_info: 'Mr. Nam',
      support_criteria: 'Children',
      receivingPoint: RECEIVING_POINT,
      categoryIds: [TOY_CATEGORY],
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
    // An ADMIN token on the user routes is refused with 403 (signed in, wrong role).
    expect(userCancel.status).toBe(403);
    const mine = await request(app).get('/donation-requests/mine').set(as(admin, 'ADMIN'));
    expect(mine.status).toBe(403);

    const adminCancel = await request(app)
      .post(`/admin/donation-requests/${id}/cancel`)
      .set(as(admin, 'ADMIN'))
      .send({ reason: 'Tổ chức không cần nữa' });
    expect(adminCancel.status).toBe(200);
    expect(adminCancel.body.data.cancellation).toMatchObject({ reason: 'CANCELLED_BY_ADMIN' });
    expect(await AuditLog.countDocuments({ action: 'donation.cancel' })).toBe(1);
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
    const foreign = await send({ handoverMethod: 'drop_off', photos: [photoOf(receiver)] });
    expect(foreign.status).toBe(422);
    expect(foreign.body.error.code).toBe('HANDOVER_PHOTO_NOT_OWNED');
    expect((await DonationRequest.findById(id).lean())?.status).toBe('accepted');
  });

  it('needs a handover method (MSG52); carrier name and tracking code only for a carrier', async () => {
    const id = await accepted();
    const send = (body: object) =>
      request(app).post(`/donation-requests/${id}/handover`).set(as(donor)).send(body);
    const noMethod = await send({ photos: [photoOf(donor)] });
    expect(noMethod.status).toBe(400);
    expect(JSON.stringify(noMethod.body.error.details)).toContain(
      'Vui lòng chọn mang đến hoặc gửi qua vận chuyển.',
    );
    expect((await send({ handoverMethod: 'ship', photos: [photoOf(donor)] })).status).toBe(400);
    expect(
      (
        await send({
          handoverMethod: 'drop_off',
          trackingCode: 'GHN123',
          photos: [photoOf(donor)],
        })
      ).status,
    ).toBe(400);

    const sent = await send({
      handoverMethod: 'carrier',
      carrierName: 'Giao Hàng Nhanh',
      trackingCode: 'GHN-123456',
      photos: [photoOf(donor)],
    });
    expect(sent.status).toBe(200);
    expect(sent.body.data).toMatchObject({
      status: 'shipping',
      handoverMethod: 'carrier',
      carrierName: 'Giao Hàng Nhanh',
      trackingCode: 'GHN-123456',
    });
    expect(await DonationRequest.findById(id).lean()).toMatchObject({
      handoverMethod: 'carrier',
      trackingCode: 'GHN-123456',
    });
  });

  it('receipt needs photos (GB-20); only the receiver, and photos must be theirs', async () => {
    const id = await shipping();
    expect(
      (
        await request(app)
          .post(`/donation-requests/${id}/confirm-received`)
          .set(as(donor))
          .send({ photos: [photoOf(donor)] })
      ).status,
    ).toBe(403);
    for (const body of [{}, { photos: [] }, { note: 'Đã nhận' }]) {
      const noPhotos = await request(app)
        .post(`/donation-requests/${id}/confirm-received`)
        .set(as(receiver))
        .send(body);
      expect(noPhotos.status).toBe(400);
      expect(noPhotos.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await DonationRequest.findById(id).lean())?.status).toBe('shipping');
    const foreign = await request(app)
      .post(`/donation-requests/${id}/confirm-received`)
      .set(as(receiver))
      .send({ photos: [photoOf(donor)] });
    expect(foreign.body.error.code).toBe('HANDOVER_PHOTO_NOT_OWNED');
    const done = await request(app)
      .post(`/donation-requests/${id}/confirm-received`)
      .set(as(receiver))
      .send({ photos: [photoOf(receiver)] });
    expect(done.body.data.status).toBe('completed');
    expect(done.body.data.handovers.map((h: { step: string }) => h.step)).toEqual([
      'DONOR_SENT',
      'RECEIVER_RECEIVED',
    ]);
  });
});

describe('stuck SHIPPING: the Admin way out', () => {
  it('users cannot cancel a SHIPPING request; an Admin can, with a reason (toy stays hidden, GB-60)', async () => {
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
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancellation).toMatchObject({
      reason: 'CANCELLED_BY_ADMIN',
      note: 'Đồ chơi thất lạc khi gửi',
    });
    expect(await toyStatus()).toBe('hidden');
    const audit = await AuditLog.findOne({ action: 'donation.cancel', target_id: id }).lean();
    expect(String(audit?.actor_id)).toBe(admin);
    expect(audit?.target_type).toBe('DONATION_REQUEST');
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
    expect(res.body.data.status).toBe('completed');
    expect(await toyStatus()).toBe('hidden');
    const audit = await AuditLog.findOne({
      action: 'donation.confirm_received',
      target_id: id,
    }).lean();
    expect(String(audit?.actor_id)).toBe(admin);
  });
});

describe('admin list filters and donor summary', () => {
  it('filters the counts by receiver type, organization and q; rejects unknown params', async () => {
    await createRequest(receiver);
    await createOrgRequest();
    const counts = (query: string) =>
      request(app).get(`/admin/donation-requests/counts${query}`).set(as(admin, 'ADMIN'));
    expect((await counts('?receiverType=ORGANIZATION')).body.data).toMatchObject({ pending: 1 });
    expect((await counts(`?organizationId=${organizationId}`)).body.data.pending).toBe(1);
    expect((await counts('?q=wooden')).body.data.pending).toBe(2);
    expect((await counts('?q=nothing-like-this')).body.data.pending).toBe(0);
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
    const summary = await request(app).get(`/donors/${other}/donation-summary`);
    expect(summary.body.data).toEqual({ userId: other, completedDonations: 0 });
    expect((await request(app).get('/donors/not-an-id/donation-summary')).status).toBe(400);
  });
});

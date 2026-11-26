// UC33 steps 4-5: a new donation post that names an organization keeps it with the post, and the
// donation request to that organization is created as Pending when the Admin approves the post
// (through the real moderation route and the TOY_REVIEWED subscription).
import express from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Category } from '../../src/models/category.model.js';
import { DonationRequest } from '../../src/models/donation-request.model.js';
import { IdentityVerification } from '../../src/models/identity-verification.model.js';
import { Organization } from '../../src/models/organization.model.js';
import { Toy } from '../../src/models/toy.model.js';
import { User } from '../../src/models/user.model.js';
import { createDonationPostsRouter } from '../../src/routes/donation-post.routes.js';
import { adminDonationRequestsRouter } from '../../src/routes/donation-request.routes.js';
import { adminToyModerationRouter } from '../../src/routes/toy-moderation.routes.js';
import { subscribeDonations } from '../../src/services/donation.subscriptions.js';
import { domainEvents, type NotifyEvent } from '../../src/utils/domain-events.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { testAuth } from '../support/test-auth.js';
import { newId, pause, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const app = express();
app.use(express.json());
app.use(testAuth);
app.use(
  '/donation-posts',
  createDonationPostsRouter({
    upload: async () => ({ url: 'https://example.com/p.jpg', publicId: `toyflow/toys/${newId()}` }),
    delete: async () => undefined,
  }),
);
app.use('/admin/toys', adminToyModerationRouter);
app.use('/admin/donation-requests', adminDonationRequestsRouter);
app.use(errorHandler);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const safetyChecklist = {
  photosShowWholeToy: true,
  ageFitsSmallParts: true,
  batteryCompartmentSecured: true,
  notRecalledOrBanned: true,
  noHiddenDefect: true,
};
const receivingPoint = {
  province: 'Hà Nội',
  ward: 'Phường Hoàn Kiếm',
  street: '12 Hàng Bài',
  openingHours: '8:00–17:00',
  contactName: 'Cô Lan',
  contactPhone: '+84912000111',
  acceptsDropOff: true,
  acceptsParcel: true,
};

let donor: string;
let admin: string;
let categoryId: string;
let orgId: string;
let unsubscribe: () => void;

const asDonor = { 'x-test-user': '', 'x-test-role': 'USER' };
const asAdmin = { 'x-test-user': '', 'x-test-role': 'ADMIN' };

const createOrganization = async (overrides: Record<string, unknown> = {}) =>
  String(
    (
      await Organization.create({
        name: `Mái ấm ${newId()}`,
        address: '12 Hàng Bài, Hà Nội',
        contact_info: '+84912000111',
        status: 'active',
        receivingPoint,
        ...overrides,
      })
    )._id,
  );

const sendPost = (target: Record<string, string> = {}) => {
  const req = request(app)
    .post('/donation-posts')
    .set(asDonor)
    .field('title', 'Bộ tàu hỏa gỗ')
    .field('description', 'Bộ tàu hỏa gỗ đủ 20 chi tiết, sơn còn đẹp, bé nhà mình không chơi nữa.')
    .field('condition', 'like_new')
    .field('categoryId', categoryId)
    .field('ageRange', JSON.stringify({ minAge: 3, maxAge: 6 }));
  for (const [name, value] of Object.entries(target)) void req.field(name, value);
  for (let i = 1; i <= 3; i += 1) {
    void req.attach('images', PNG, { filename: `p${i}.png`, contentType: 'image/png' });
  }
  return req;
};

/** The Admin approves the post in the moderation queue (UC27). */
const approve = async (toyId: string) => {
  const toy = await Toy.findById(toyId).lean();
  const res = await request(app)
    .post(`/admin/toys/${toyId}/approve`)
    .set(asAdmin)
    .send({ expectedUpdatedAt: toy?.updatedAt.toISOString(), safetyChecklist });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
};

/** The request is created by the TOY_REVIEWED handler, after the approval has answered. */
const requestOf = async (toyId: string) => {
  for (let i = 0; i < 50; i += 1) {
    const found = await DonationRequest.findOne({ toyId }).lean();
    if (found) return found;
    await pause(20);
  }
  return null;
};

beforeAll(async () => {
  donor = String(
    (
      await User.create({
        phone: '+84901000001',
        email: 'donor@post-org.example.com',
        passwordHash: 'x',
        fullName: 'Người Tặng',
        verificationStatus: 'verified',
      })
    )._id,
  );
  admin = String(newId());
  asDonor['x-test-user'] = donor;
  asAdmin['x-test-user'] = admin;
  await IdentityVerification.collection.insertOne({
    userId: new Types.ObjectId(donor),
    status: 'verified',
    submittedAt: new Date(),
  });
  categoryId = String(
    (await Category.create({ name: 'Tàu hỏa', slug: 'tau-hoa', status: 'active' }))._id,
  );
  unsubscribe = subscribeDonations();
});

afterAll(() => unsubscribe());

// The Donor's notices (notify(); the notifications feature saves, pushes and emails them).
let notices: NotifyEvent[] = [];
let stopListening: () => void = () => undefined;
beforeEach(() => {
  notices = [];
  stopListening = domainEvents.subscribe('NOTIFY', (event) => {
    notices.push(event);
  });
});
afterEach(() => stopListening());

beforeEach(async () => {
  await Promise.all([
    Toy.deleteMany({}),
    DonationRequest.deleteMany({}),
    Organization.deleteMany({}),
  ]);
  orgId = await createOrganization();
});

describe('UC33: a new donation post sent to an organization', () => {
  it('keeps the organization with the post and creates the Pending request once approved', async () => {
    const res = await sendPost({ organizationId: orgId, handoverMethod: 'carrier' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.donationTarget).toEqual({
      organizationId: orgId,
      handoverMethod: 'carrier',
    });
    const id = res.body.data.id as string;
    // The description is the Donor's text only.
    expect(res.body.data.description).not.toContain('Đơn vị tiếp nhận');
    // Pending review: no request yet (step 5).
    expect(await DonationRequest.countDocuments({ toyId: id })).toBe(0);

    await approve(id);
    const created = await requestOf(id);
    expect(created).toMatchObject({ status: 'pending', handoverMethod: 'carrier' });
    expect(String(created?.donorId)).toBe(donor);
    // The Donor created it, so the Admin decides it for the organization (GB-56).
    expect(String(created?.requestedBy)).toBe(donor);
    expect(String(created?.receiver?.organizationId)).toBe(orgId);
    expect((await Toy.findById(id).lean())?.donationTarget).toBeUndefined();
    // UC33 step 5, GB-61: the Donor is told the request went to the organization.
    expect(notices).toEqual([
      expect.objectContaining({
        notificationType: 'DONATION_STATUS_CHANGED',
        to: donor,
        link: `/donations/${String(created?._id)}`,
      }),
    ]);
    expect(notices[0]!.title).toContain('đã được gửi tới Mái ấm');
    expect(notices[0]!.body).toContain(created!.code);

    const accepted = await request(app)
      .post(`/admin/donation-requests/${String(created?._id)}/accept`)
      .set(asAdmin)
      .send({});
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect((await Toy.findById(id).lean())?.status).toBe('hidden');
  });

  it('carries the note to the organization (R03 III.5.2.1 (8)) into the request', async () => {
    const note = `  ${'Thiếu một bánh xe, '.repeat(20).slice(0, 299)}.  `;
    expect(note.trim()).toHaveLength(300);
    const res = await sendPost({ organizationId: orgId, handoverMethod: 'drop_off', note });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.donationTarget).toEqual({
      organizationId: orgId,
      handoverMethod: 'drop_off',
      note: note.trim(),
    });
    await approve(res.body.data.id);
    const created = await requestOf(res.body.data.id);
    expect(created?.itemDetails).toBe(note.trim());
    const detail = await request(app)
      .get(`/admin/donation-requests/${String(created?._id)}`)
      .set(asAdmin);
    expect(detail.body.data.message).toBe(note.trim());
  });

  it('checks the note: at most 300 characters, only with an organization, blank = none', async () => {
    const tooLong = await sendPost({
      organizationId: orgId,
      handoverMethod: 'carrier',
      note: 'a'.repeat(301),
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.details).toEqual({ field: 'note' });
    const alone = await sendPost({ note: 'Còn đủ 20 chi tiết' });
    expect(alone.status).toBe(400);
    expect(alone.body.error.details).toEqual({ field: 'organizationId' });
    expect(await Toy.countDocuments({})).toBe(0);

    const blank = await sendPost({ organizationId: orgId, handoverMethod: 'carrier', note: '   ' });
    expect(blank.status).toBe(201);
    expect(blank.body.data.donationTarget).toEqual({
      organizationId: orgId,
      handoverMethod: 'carrier',
    });
    await approve(blank.body.data.id);
    // No note: the request keeps develop's default message (the toy title).
    expect((await requestOf(blank.body.data.id))?.itemDetails).toBe('Bộ tàu hỏa gỗ');
  });

  it('keeps a post without an organization open for requests (FE-02)', async () => {
    const res = await sendPost();
    expect(res.status).toBe(201);
    expect(res.body.data.donationTarget).toBeNull();
    await approve(res.body.data.id);
    await pause(100);
    expect(await DonationRequest.countDocuments({})).toBe(0);
  });

  it('checks the organization and the handover method when the post is sent', async () => {
    const noMethod = await sendPost({ organizationId: orgId });
    expect(noMethod.status).toBe(400);
    expect(noMethod.body.error.details).toEqual({ field: 'handoverMethod' });
    expect((await sendPost({ organizationId: 'abc', handoverMethod: 'carrier' })).status).toBe(400);

    const parcelOnly = await createOrganization({
      receivingPoint: { ...receivingPoint, acceptsDropOff: false },
    });
    const method = await sendPost({ organizationId: parcelOnly, handoverMethod: 'drop_off' });
    expect(method.status).toBe(422);
    expect(method.body.error.code).toBe('HANDOVER_METHOD_NOT_ALLOWED');

    const paused = await createOrganization({ isAccepting: false });
    const notAccepting = await sendPost({ organizationId: paused, handoverMethod: 'carrier' });
    expect(notAccepting.status).toBe(409);
    expect(notAccepting.body.error.code).toBe('ORGANIZATION_NOT_ACCEPTING');

    const hidden = await createOrganization({ status: 'hidden' });
    const gone = await sendPost({ organizationId: hidden, handoverMethod: 'carrier' });
    expect(gone.body.error.code).toBe('ORGANIZATION_NOT_AVAILABLE');
    const missing = await sendPost({ organizationId: String(newId()), handoverMethod: 'carrier' });
    expect(missing.status).toBe(404);

    // GB-51: an organization without a receiving point takes no toy.
    const noPoint = await createOrganization({ receivingPoint: undefined });
    const pointless = await sendPost({ organizationId: noPoint, handoverMethod: 'carrier' });
    expect(pointless.status).toBe(409);
    expect(pointless.body.error.code).toBe('ORGANIZATION_NO_RECEIVING_POINT');

    expect(await Toy.countDocuments({})).toBe(0);
  });

  it('creates no request when the organization stopped taking toys before the approval', async () => {
    const res = await sendPost({ organizationId: orgId, handoverMethod: 'drop_off' });
    const id = res.body.data.id as string;
    await Organization.updateOne({ _id: orgId }, { $set: { isAccepting: false } });
    await approve(id);
    await pause(150);
    expect(await DonationRequest.countDocuments({ toyId: id })).toBe(0);
    // The post stays open (step 6.1), without the stale target.
    const toy = await Toy.findById(id).lean();
    expect(toy?.status).toBe('active');
    expect(toy?.donationTarget).toBeUndefined();
    // MSG51: the Donor is told to choose another organization, with a link to the post.
    expect(notices).toEqual([
      expect.objectContaining({
        notificationType: 'DONATION_STATUS_CHANGED',
        to: donor,
        link: `/toys/${id}`,
      }),
    ]);
    expect(notices[0]!.body).toContain('tổ chức hiện không nhận đồ chơi');
    expect(notices[0]!.body).toContain('chọn tổ chức khác');
  });

  it('tells the Donor when the organization was hidden or changed its methods before the approval', async () => {
    const hiddenPost = await sendPost({ organizationId: orgId, handoverMethod: 'drop_off' });
    const otherOrg = await createOrganization();
    const methodPost = await sendPost({ organizationId: otherOrg, handoverMethod: 'drop_off' });
    await Organization.updateOne({ _id: orgId }, { $set: { status: 'hidden' } });
    await Organization.updateOne(
      { _id: otherOrg },
      { $set: { 'receivingPoint.acceptsDropOff': false } },
    );
    await approve(hiddenPost.body.data.id);
    await approve(methodPost.body.data.id);
    await pause(150);
    expect(await DonationRequest.countDocuments({})).toBe(0);
    const bodyFor = (toyId: string) => notices.find((n) => n.link === `/toys/${toyId}`)?.body;
    expect(bodyFor(hiddenPost.body.data.id)).toContain('tổ chức hiện không nhận đồ chơi');
    expect(bodyFor(methodPost.body.data.id)).toContain(
      'điểm nhận của tổ chức không còn nhận cách bàn giao bạn đã chọn',
    );
  });

  it('tells nobody when a post without an organization is approved', async () => {
    const res = await sendPost();
    await approve(res.body.data.id);
    await pause(100);
    expect(notices).toEqual([]);
  });
});

// Donation flow on develop's schemas, through the feature routers behind a stand-in for
// develop's authenticate middleware: the locked donor (GB-05), the expiry job driven by
// donation_requests.timer.dueAt (R03 job 9), contact sharing (D-03) and the donation posts.
import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Category } from '../../src/models/category.model.js';
import { DonationRequest } from '../../src/models/donation-request.model.js';
import { createDonationPostsRouter } from '../../src/routes/donation-post.routes.js';
import {
  adminDonationRequestsRouter,
  donationRequestsRouter,
} from '../../src/routes/donation-request.routes.js';
import { expireStaleRequests } from '../../src/services/donation-request.lifecycle.js';
import { IdentityVerification } from '../../src/models/identity-verification.model.js';
import { Organization } from '../../src/models/organization.model.js';
import { Toy } from '../../src/models/toy.model.js';
import { User } from '../../src/models/user.model.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { testAuth } from '../support/test-auth.js';
import { newId, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const DAY = 24 * 60 * 60 * 1000;
type Who = 'donor' | 'receiver' | 'other' | 'admin';

const uploaded: string[] = [];
const fakeStorage = {
  upload: async () => {
    const publicId = `toyflow/toys/${uploaded.length + 1}`;
    uploaded.push(publicId);
    return { url: `https://example.com/${publicId}.jpg`, publicId };
  },
  delete: async () => undefined,
};

const app = express();
app.use(express.json());
app.use(testAuth);
app.use('/api/v1/donation-requests', donationRequestsRouter);
app.use('/api/v1/admin/donation-requests', adminDonationRequestsRouter);
app.use('/api/v1/donation-posts', createDonationPostsRouter(fakeStorage));
app.use(errorHandler);

const ids = {} as Record<Who, string>;
let toyId: string;
let orgId: string;

const oid = (id: string) => new Types.ObjectId(id);
const headers = (who: Who) => ({
  'x-test-user': ids[who],
  'x-test-role': who === 'admin' ? 'ADMIN' : 'USER',
});
const photo = (who: Who, name = 'p1') => ({
  publicId: `toyflow/handovers/${ids[who]}/${name}`,
  format: 'jpg',
});
const post = (who: Who, path: string, body: object = {}) =>
  request(app).post(`/api/v1${path}`).set(headers(who)).send(body);
const get = (who: Who, path: string) => request(app).get(`/api/v1${path}`).set(headers(who));
const toyStatus = async () => (await Toy.findById(toyId).lean())?.status;
const requestDoc = (id: string) => DonationRequest.findById(id).lean();

const createDonationToy = async () =>
  String(
    (
      await Toy.create({
        ownerId: oid(ids.donor),
        categoryId: newId(),
        title: 'Wooden train set',
        description: 'Complete set with 20 pieces.',
        condition: 'good',
        listingType: 'donate',
        priceOrRate: 0,
        status: 'active',
        ageRange: { minAge: 3, maxAge: 6 },
        images: [{ url: 'https://example.com/1.jpg', publicId: 'toyflow/toys/1' }],
        quantity: 1,
      })
    )._id,
  );

beforeAll(async () => {
  const people: Array<[Who, 'USER' | 'ADMIN']> = [
    ['donor', 'USER'],
    ['receiver', 'USER'],
    ['other', 'USER'],
    ['admin', 'ADMIN'],
  ];
  for (const [index, [who, role]] of people.entries()) {
    const user = await User.create({
      phone: `+8490100000${index}`,
      email: `${who}@lifecycle.example.com`,
      passwordHash: 'x',
      fullName: who,
      role,
    });
    ids[who] = String(user._id);
  }
});

beforeEach(async () => {
  await Promise.all([
    DonationRequest.deleteMany({}),
    Toy.deleteMany({}),
    Organization.deleteMany({}),
    User.updateMany({}, { $set: { status: 'ACTIVE' } }),
  ]);
  toyId = await createDonationToy();
  const org = await Organization.create({
    name: 'Org A',
    address: '1 Street',
    contact_info: '+84901999999',
    support_criteria: 'Children',
  });
  orgId = String(org._id);
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
    handoverMethod: 'drop_off',
    photos: [photo('donor')],
  });
  expect(res.status).toBe(200);
  return id;
};

describe("develop's schema fields", () => {
  it('stores receiver, itemDetails, deliveryMethod and the expiry timer', async () => {
    const id = await create();
    const doc = await requestDoc(id);
    expect(doc).toMatchObject({
      status: 'pending',
      itemDetails: 'Cho con tôi',
      deliveryMethod: 'shipping',
    });
    expect(String(doc?.receiver?.userId)).toBe(ids.receiver);
    expect(doc?.timer?.dueAt?.getTime()).toBeGreaterThan(Date.now() + 13 * DAY);
  });
});

describe('locked donor (D-07, GB-05)', () => {
  it('refuses a request on a toy of a LOCKED donor', async () => {
    await User.updateOne({ _id: ids.donor }, { $set: { status: 'LOCKED' } });
    const res = await post('receiver', '/donation-requests', { toyId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DONOR_LOCKED');
    expect(await DonationRequest.countDocuments({})).toBe(0);
  });
});

describe('expiry job (D-05, R03 job 9)', () => {
  it('expires pending requests once timer.dueAt has passed', async () => {
    const id = await create();
    const now = new Date();
    expect(await expireStaleRequests(now)).toEqual({ expiredPending: 0, expiredAccepted: 0 });
    const later = new Date(now.getTime() + 14 * DAY + 1000);
    expect(await expireStaleRequests(later)).toEqual({ expiredPending: 1, expiredAccepted: 0 });
    const doc = await requestDoc(id);
    expect(doc?.status).toBe('cancelled');
    expect(doc?.cancellation).toMatchObject({ reason: 'EXPIRED', actorType: 'SYSTEM' });
    expect(doc?.timer?.dueAt).toBeUndefined();
    // Idempotent: a second run finds nothing.
    expect(await expireStaleRequests(later)).toEqual({ expiredPending: 0, expiredAccepted: 0 });
  });

  it('expires accepted requests not handed over in time; toy back to active', async () => {
    const id = await accepted();
    expect(await toyStatus()).toBe('hidden');
    const later = new Date(Date.now() + 15 * DAY);
    expect(await expireStaleRequests(later)).toEqual({ expiredPending: 0, expiredAccepted: 1 });
    expect((await requestDoc(id))?.status).toBe('cancelled');
    expect(await toyStatus()).toBe('active');
    // The toy can be requested again.
    await create('other');
  });

  it('never expires shipping requests', async () => {
    const shipped = await shipping();
    const farFuture = new Date(Date.now() + 365 * DAY);
    expect(await expireStaleRequests(farFuture)).toEqual({
      expiredPending: 0,
      expiredAccepted: 0,
    });
    expect((await requestDoc(shipped))?.status).toBe('shipping');
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
      expect(doc?.status).toBe('accepted');
      expect(await toyStatus()).toBe('hidden');
    } else {
      expect(doc?.status).toBe('cancelled');
      expect(await toyStatus()).toBe('active');
    }
  });
});

describe('contact sharing (D-03)', () => {
  const contactOf = async (who: Who, id: string) => {
    const res = await get(who, `/donation-requests/${id}`);
    expect(res.status).toBe(200);
    return res.body.data.counterpartContact as { name: string; phone: string | null } | null;
  };
  const donorContact = { name: 'donor', phone: '+84901000000' };
  const receiverContact = { name: 'receiver', phone: '+84901000001' };

  it('pending: no contact; accepted/shipping: both sides; completed: hidden again', async () => {
    const id = await create();
    expect(await contactOf('donor', id)).toBeNull();
    expect((await get('other', `/donation-requests/${id}`)).status).toBe(404);
    await post('donor', `/donation-requests/${id}/accept`);
    expect(await contactOf('donor', id)).toEqual(receiverContact);
    expect(await contactOf('receiver', id)).toEqual(donorContact);
    const mine = await get('receiver', '/donation-requests/mine');
    expect(JSON.stringify(mine.body.data)).not.toContain('@lifecycle.example.com');

    const admin = await get('admin', `/admin/donation-requests/${id}`);
    expect(admin.body.data.counterpartContact).toBeNull();
    expect(admin.body.data.donor.phone).not.toBe(donorContact.phone);

    await post('donor', `/donation-requests/${id}/handover`, {
      handoverMethod: 'drop_off',
      photos: [photo('donor')],
    });
    await post('receiver', `/donation-requests/${id}/confirm-received`, {
      photos: [photo('receiver')],
    });
    expect(await contactOf('donor', id)).toBeNull();
    const detail = await get('receiver', `/donation-requests/${id}`);
    expect(detail.body.data.history.map((row: { toStatus: string }) => row.toStatus)).toEqual([
      'pending',
      'accepted',
      'shipping',
      'completed',
    ]);
  });

  it('organization request: the donor sees the organization contact once accepted', async () => {
    const res = await post('admin', '/admin/donation-requests', { toyId, organizationId: orgId });
    const id = res.body.data.id as string;
    expect(await contactOf('donor', id)).toBeNull();
    expect((await post('donor', `/donation-requests/${id}/accept`)).status).toBe(200);
    expect(await contactOf('donor', id)).toEqual({ name: 'Org A', phone: '+84901999999' });
    const admin = await get('admin', `/admin/donation-requests/${id}`);
    expect(admin.body.data.organization.contactInfo).toBe('+84901999999');
  });
});

describe('donation posts (POST /donation-posts)', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  // The description the web form sends: the Donor's text, then the handover method and the
  // preferred organization (composeDonationDescription in the frontend).
  const DESCRIPTION = [
    'Gấu bông còn mới, đã giặt sạch và phơi khô, không rách chỉ hay bong mắt.',
    '',
    'Cách bàn giao: Gửi qua đơn vị vận chuyển',
    'Đơn vị tiếp nhận mong muốn: Để ToyFlow ghép tổ chức phù hợp',
  ].join('\n');
  // A donation post has 3 to 10 photos (R03 GB-10).
  const send = (
    who: Who,
    categoryId: string,
    photos = 3,
    text: { title?: string; description?: string } = {},
  ) => {
    const req = request(app)
      .post('/api/v1/donation-posts')
      .set(headers(who))
      .field('title', text.title ?? 'Gấu bông')
      .field('description', text.description ?? DESCRIPTION)
      .field('condition', 'like_new')
      .field('categoryId', categoryId)
      .field('ageRange', JSON.stringify({ minAge: 1, maxAge: 5 }));
    for (let i = 1; i <= photos; i += 1) {
      void req.attach('images', PNG, { filename: `p${i}.png`, contentType: 'image/png' });
    }
    return req;
  };
  const verifyDonor = () =>
    IdentityVerification.collection.insertOne({
      userId: oid(ids.donor),
      status: 'verified',
      submittedAt: new Date(),
    });

  it('creates a pending free donate toy for a verified user in an active category', async () => {
    const category = await Category.create({ name: 'Gấu', slug: 'gau', status: 'active' });
    expect((await send('donor', String(category._id))).status).toBe(403);

    await verifyDonor();
    const res = await send('donor', String(category._id));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.images).toHaveLength(3);
    expect(res.body.data).toMatchObject({
      listingType: 'donate',
      priceOrRate: 0,
      status: 'pending',
      categoryId: String(category._id),
      categoryName: 'Gấu',
    });
    const toy = await Toy.findById(res.body.data.id).lean();
    expect(toy).toMatchObject({ listingType: 'donate', priceOrRate: 0, status: 'pending' });
    expect(toy?.moderation?.submittedAt).toBeInstanceOf(Date);

    expect((await send('donor', String(newId()))).status).toBe(400);
    expect((await request(app).post('/api/v1/donation-posts')).status).toBe(401);
    await mongoose.connection.collection('identityverifications').deleteMany({});
  });

  it('refuses a donation post with fewer than 3 photos and uploads nothing (GB-10)', async () => {
    const category = await Category.create({ name: 'Búp bê', slug: 'bup-be', status: 'active' });
    await verifyDonor();
    const uploadsBefore = uploaded.length;

    for (const photos of [0, 2]) {
      const res = await send('donor', String(category._id), photos);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'A donation post needs 3 to 10 images.',
      });
    }
    expect(uploaded).toHaveLength(uploadsBefore);
    expect(await Toy.countDocuments({ categoryId: category._id })).toBe(0);

    // 10 photos is the most a donation post takes; an 11th is refused by the upload middleware.
    expect((await send('donor', String(category._id), 10)).status).toBe(201);
    const tooMany = await send('donor', String(category._id), 11);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.code).toBe('INVALID_IMAGE_UPLOAD');
    await mongoose.connection.collection('identityverifications').deleteMany({});
  });

  it('checks the title and description like a rent or sale listing (R03 III.5.2.1 (1))', async () => {
    const category = await Category.create({ name: 'Xe', slug: 'xe', status: 'active' });
    await verifyDonor();
    const uploadsBefore = uploaded.length;
    const refused = async (text: { title?: string; description?: string }, field: string) => {
      const res = await send('donor', String(category._id), 3, text);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { field } });
    };

    await refused({ title: 'T'.repeat(101) }, 'title');
    await refused({ description: 'D'.repeat(49) }, 'description');
    await refused({ description: 'D'.repeat(1001) }, 'description');
    expect(uploaded).toHaveLength(uploadsBefore);

    for (const text of [
      { title: 'T'.repeat(100) },
      { description: 'D'.repeat(50) },
      { description: 'D'.repeat(1000) },
    ]) {
      expect((await send('donor', String(category._id), 3, text)).status).toBe(201);
    }
    await mongoose.connection.collection('identityverifications').deleteMany({});
  });

  it('refuses a phone number, an email or a link in the title or description (GB-11)', async () => {
    const category = await Category.create({ name: 'Bóng', slug: 'bong', status: 'active' });
    await verifyDonor();
    const uploadsBefore = uploaded.length;
    const refused = async (text: { title?: string; description?: string }, field: string) => {
      const res = await send('donor', String(category._id), 3, text);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error).toMatchObject({
        code: 'CONTACT_DETAILS_NOT_ALLOWED',
        details: { field },
      });
    };

    await refused({ title: 'Gấu bông 0912.345.678' }, 'title');
    await refused({ description: `${DESCRIPTION}\nZalo +84 912 345 678` }, 'description');
    await refused({ description: `${DESCRIPTION}\nEmail be.na@gmail.com` }, 'description');
    await refused({ description: `${DESCRIPTION}\nẢnh: https://imgur.com/abc` }, 'description');
    expect(uploaded).toHaveLength(uploadsBefore);
    expect(await Toy.countDocuments({ categoryId: category._id })).toBe(0);

    // Honest text that only warns the Admin is saved.
    const honest = await send('donor', String(category._id), 3, {
      title: 'Gấu bông Momo',
      description: `${DESCRIPTION}\nMẫu đang hot trên TikTok, mã vạch 8936036022345.`,
    });
    expect(honest.status, JSON.stringify(honest.body)).toBe(201);
    await mongoose.connection.collection('identityverifications').deleteMany({});
  });
});

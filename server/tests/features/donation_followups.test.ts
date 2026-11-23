// Charity follow-ups (UC30, UC33, UC35): the GB-57 time limits from the System Settings, the
// overdue flag and the filters of the Admin Donation List.
import express from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DonationRequest } from '../../src/models/donation-request.model.js';
import { Organization } from '../../src/models/organization.model.js';
import { SystemSetting } from '../../src/models/system-setting.model.js';
import { Toy } from '../../src/models/toy.model.js';
import { User } from '../../src/models/user.model.js';
import {
  adminDonationRequestsRouter,
  donationRequestsRouter,
} from '../../src/routes/donation-request.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { testAuth } from '../support/test-auth.js';
import { newId, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const DAY = 24 * 60 * 60 * 1000;
type Who = 'donor' | 'receiver' | 'admin';

const app = express();
app.use(express.json());
app.use(testAuth);
app.use('/donation-requests', donationRequestsRouter);
app.use('/admin/donation-requests', adminDonationRequestsRouter);
app.use(errorHandler);

const ids = {} as Record<Who, string>;
let toyId: string;
let orgId: string;

const headers = (who: Who) => ({
  'x-test-user': ids[who],
  'x-test-role': who === 'admin' ? 'ADMIN' : 'USER',
});
const post = (who: Who, path: string, body: object = {}) =>
  request(app).post(path).set(headers(who)).send(body);
const get = (who: Who, path: string) => request(app).get(path).set(headers(who));
const photo = (who: Who, name = 'p1') => ({
  publicId: `toyflow/handovers/${ids[who]}/${name}`,
  format: 'jpg',
});

const receivingPoint = {
  province: 'Hà Nội',
  ward: 'Phường Láng',
  street: '12 Chùa Láng',
  openingHours: '8:00 – 17:00',
  contactName: 'Nguyễn Thị Lan',
  contactPhone: '0901234567',
  acceptsDropOff: true,
  acceptsParcel: true,
};
const categoryId = newId();

const createToy = async (overrides: Record<string, unknown> = {}) =>
  String(
    (
      await Toy.create({
        ownerId: new Types.ObjectId(ids.donor),
        categoryId,
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
      })
    )._id,
  );

const createOrganization = async (overrides: Record<string, unknown> = {}) =>
  String(
    (
      await Organization.create({
        name: `Org ${new Types.ObjectId().toHexString()}`,
        address: '1 Street',
        contact_info: '0901999999',
        status: 'active',
        receivingPoint,
        ageGroups: [{ minAge: 3, maxAge: 6 }],
        categoryIds: [categoryId],
        isAccepting: true,
        ...overrides,
      })
    )._id,
  );

beforeAll(async () => {
  const people: Array<[Who, 'USER' | 'ADMIN']> = [
    ['donor', 'USER'],
    ['receiver', 'USER'],
    ['admin', 'ADMIN'],
  ];
  for (const [index, [who, role]] of people.entries()) {
    const user = await User.create({
      phone: `+8490200000${index}`,
      email: `${who}@followups.example.com`,
      passwordHash: 'x',
      fullName: who,
      role,
      verificationStatus: 'verified',
    });
    ids[who] = String(user._id);
  }
});

beforeEach(async () => {
  await Promise.all([
    DonationRequest.deleteMany({}),
    Toy.deleteMany({}),
    Organization.deleteMany({}),
    SystemSetting.deleteMany({}),
  ]);
  toyId = await createToy();
  orgId = await createOrganization();
});

/** A Donor's request to the organization (UC33), Pending for the Admin. */
const donorRequest = async (organizationId = orgId, toy = toyId) => {
  const res = await post('donor', '/donation-requests/to-organization', {
    toyId: toy,
    organizationId,
    handoverMethod: 'drop_off',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
};
const receiverRequest = async (toy = toyId) => {
  const res = await post('receiver', '/donation-requests', { toyId: toy });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
};
const adminRequest = async (organizationId = orgId, toy = toyId) => {
  const res = await post('admin', '/admin/donation-requests', { toyId: toy, organizationId });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
};
const handOver = (id: string) =>
  post('donor', `/donation-requests/${id}/handover`, {
    handoverMethod: 'drop_off',
    photos: [photo('donor')],
  });
/** A Donor request accepted by the Admin and handed over: Shipping. */
const shippingRequest = async (organizationId = orgId, toy = toyId) => {
  const id = await donorRequest(organizationId, toy);
  expect((await post('admin', `/admin/donation-requests/${id}/accept`)).status).toBe(200);
  expect((await handOver(id)).status).toBe(200);
  return id;
};
const sentDaysAgo = (id: string, days: number) =>
  DonationRequest.updateOne(
    { _id: id },
    { $set: { 'handovers.0.at': new Date(Date.now() - days * DAY) } },
  );

const setSetting = (key: string, value: string) => SystemSetting.create({ key, value });
const daysFromNow = (date: Date | string | null | undefined) =>
  Math.round((new Date(date ?? 0).getTime() - Date.now()) / DAY);
const listIds = async (query: string) => {
  const res = await get('admin', `/admin/donation-requests${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body.data as Array<{ id: string }>).map((item) => item.id).sort();
};

describe('GB-57 time limits from the System Settings (UC30)', () => {
  it('uses 14 days by default for the decision and the handover', async () => {
    const id = await donorRequest();
    expect(daysFromNow((await DonationRequest.findById(id).lean())?.timer?.dueAt)).toBe(14);
    const accepted = await post('admin', `/admin/donation-requests/${id}/accept`);
    expect(accepted.status).toBe(200);
    expect(daysFromNow(accepted.body.data.dueAt)).toBe(14);
  });

  it('reads DONATION_DECISION_DAYS and DONATION_HANDOVER_DAYS for every kind of request', async () => {
    await setSetting('DONATION_DECISION_DAYS', '3');
    await setSetting('DONATION_HANDOVER_DAYS', ' 5 ');
    const fromReceiver = await receiverRequest();
    const fromAdmin = await adminRequest(orgId, await createToy());
    const fromDonor = await donorRequest(orgId, await createToy());
    for (const id of [fromReceiver, fromAdmin, fromDonor]) {
      expect(daysFromNow((await DonationRequest.findById(id).lean())?.timer?.dueAt)).toBe(3);
    }
    const accepted = await post('donor', `/donation-requests/${fromReceiver}/accept`);
    expect(daysFromNow(accepted.body.data.dueAt)).toBe(5);
    const byAdmin = await post('admin', `/admin/donation-requests/${fromDonor}/accept`);
    expect(daysFromNow(byAdmin.body.data.dueAt)).toBe(5);
  });

  it('keeps the default for a value that is not a whole number of days from 1', async () => {
    for (const [index, value] of ['0', '-2', '2.5', 'abc', '', '7 ngày'].entries()) {
      await SystemSetting.deleteMany({});
      await setSetting('DONATION_DECISION_DAYS', value || ' ');
      const id = await donorRequest(orgId, await createToy({ title: `Toy ${index}` }));
      expect(
        daysFromNow((await DonationRequest.findById(id).lean())?.timer?.dueAt),
        `value "${value}"`,
      ).toBe(14);
    }
  });

  it('flags a shipping request as overdue after DONATION_CONFIRM_DAYS, without confirming it', async () => {
    await setSetting('DONATION_CONFIRM_DAYS', '2');
    const id = await shippingRequest();

    const detail = await get('admin', `/admin/donation-requests/${id}`);
    expect(detail.body.data).toMatchObject({ status: 'shipping', overdue: false, dueAt: null });
    expect(daysFromNow(detail.body.data.confirmDueAt)).toBe(2);

    await sentDaysAgo(id, 3);
    const late = await get('admin', `/admin/donation-requests/${id}`);
    expect(late.body.data).toMatchObject({ status: 'shipping', overdue: true });
    // The Donor's view carries the same deadline.
    expect((await get('donor', `/donation-requests/${id}`)).body.data.overdue).toBe(true);

    // A longer limit in the settings clears the flag at once (computed on every read).
    await SystemSetting.updateOne({ key: 'DONATION_CONFIRM_DAYS' }, { $set: { value: '5' } });
    expect((await get('admin', `/admin/donation-requests/${id}`)).body.data.overdue).toBe(false);
    expect((await DonationRequest.findById(id).lean())?.status).toBe('shipping');
  });

  it('has no confirmation deadline before the handover or after the receipt', async () => {
    const pending = await donorRequest();
    const detail = await get('admin', `/admin/donation-requests/${pending}`);
    expect(detail.body.data).toMatchObject({ confirmDueAt: null, overdue: false });

    const toy = await createToy();
    const id = await shippingRequest(orgId, toy);
    await sentDaysAgo(id, 20);
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const done = await post('admin', `/admin/donation-requests/${id}/confirm-received`, {
      confirmedBy: 'Chị Lan',
      channel: 'phone',
      receivedAt: today,
      photos: [photo('admin')],
    });
    expect(done.body.data).toMatchObject({
      status: 'completed',
      confirmDueAt: null,
      overdue: false,
    });
  });
});

describe('Donation List filters (UC35 step 1)', () => {
  it('lists and counts the overdue shipping requests only', async () => {
    const late = await shippingRequest();
    const recent = await shippingRequest(orgId, await createToy());
    const pending = await donorRequest(orgId, await createToy());
    await sentDaysAgo(late, 15);

    expect(await listIds('?overdue=true')).toEqual([late]);
    expect(await listIds('?overdue=false')).toEqual([recent, pending].sort());
    const counts = await get('admin', '/admin/donation-requests/counts?overdue=true');
    expect(counts.body.data).toMatchObject({ shipping: 1, pending: 0 });
    expect(await listIds('?overdue=true&status=pending')).toEqual([]);
    expect((await get('admin', '/admin/donation-requests?overdue=yes')).status).toBe(400);

    // DONATION_CONFIRM_DAYS moves the line: 20 days is not overdue yet.
    await setSetting('DONATION_CONFIRM_DAYS', '20');
    expect(await listIds('?overdue=true')).toEqual([]);
  });

  it('filters by organization and by the province of its receiving point, typed in many ways', async () => {
    const southId = await createOrganization({
      receivingPoint: { ...receivingPoint, province: 'TP. Hồ Chí Minh' },
    });
    const highlandId = await createOrganization({
      receivingPoint: { ...receivingPoint, province: 'Tỉnh Lào Cai', acceptsDropOff: false },
    });
    const north = await donorRequest();
    const south = await adminRequest(southId, await createToy());
    const highland = await adminRequest(highlandId, await createToy());
    const forUser = await receiverRequest(await createToy());

    for (const typed of [
      'Hà Nội',
      'ha noi',
      'HÀ NỘI',
      '  hà   nội ',
      'Thành phố Hà Nội',
      'tp ha noi',
    ]) {
      expect(await listIds(`?province=${encodeURIComponent(typed)}`), typed).toEqual([north]);
    }
    for (const typed of [
      'TP. Hồ Chí Minh',
      'Hồ Chí Minh',
      'ho chi minh',
      'Thành phố Hồ Chí Minh',
    ]) {
      expect(await listIds(`?province=${encodeURIComponent(typed)}`), typed).toEqual([south]);
    }
    for (const typed of ['Lào Cai', 'lao cai', 'Tỉnh Lào Cai']) {
      expect(await listIds(`?province=${encodeURIComponent(typed)}`), typed).toEqual([highland]);
    }
    // A part of a name or another province matches nothing; a request to a user never matches.
    expect(await listIds('?province=noi')).toEqual([]);
    expect(await listIds('?province=Huế')).toEqual([]);
    expect(await listIds(`?province=${encodeURIComponent('Hà Nội')}&receiverType=USER`)).toEqual(
      [],
    );
    expect((await get('admin', '/admin/donation-requests?province=H')).status).toBe(400);
    expect(await listIds('?province=')).toHaveLength(4);

    expect(await listIds(`?organizationId=${southId}`)).toEqual([south]);
    expect(await listIds(`?organizationId=${southId}&province=ha%20noi`)).toEqual([]);
    expect(await listIds('?q=wooden')).toEqual([north, south, highland, forUser].sort());
    const counts = await get(
      'admin',
      `/admin/donation-requests/counts?province=${encodeURIComponent('hồ chí minh')}`,
    );
    expect(counts.body.data).toMatchObject({ pending: 1 });
  });
});

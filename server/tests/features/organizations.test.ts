import express from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuditLog } from '../../src/models/audit-log.model.js';
import { Category } from '../../src/models/category.model.js';
import { DonationRequest } from '../../src/models/donation-request.model.js';
import {
  adminOrganizationsRouter,
  organizationsRouter,
} from '../../src/routes/organization.routes.js';
import { Organization } from '../../src/models/organization.model.js';
import { backfillOrganizationDefaults } from '../../src/repositories/organization.repository.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { testAuth } from '../support/test-auth.js';
import { useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const app = express();
app.use(express.json());
app.use(testAuth);
app.use('/api/v1/admin/organizations', adminOrganizationsRouter);
app.use('/api/v1/organizations', organizationsRouter);
app.use(errorHandler);

const ADMIN_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

const as = (role: 'ADMIN' | 'USER', test: request.Test) =>
  test.set('x-test-user', role === 'ADMIN' ? ADMIN_ID : USER_ID).set('x-test-role', role);

const adminApi = {
  list: (query = '') => as('ADMIN', request(app).get(`/api/v1/admin/organizations${query}`)),
  get: (id: string) => as('ADMIN', request(app).get(`/api/v1/admin/organizations/${id}`)),
  create: (body: object) =>
    as('ADMIN', request(app).post('/api/v1/admin/organizations').send(body)),
  update: (id: string, body: object) =>
    as('ADMIN', request(app).patch(`/api/v1/admin/organizations/${id}`).send(body)),
  hide: (id: string) => as('ADMIN', request(app).post(`/api/v1/admin/organizations/${id}/hide`)),
  show: (id: string) => as('ADMIN', request(app).post(`/api/v1/admin/organizations/${id}/show`)),
  remove: (id: string) => as('ADMIN', request(app).delete(`/api/v1/admin/organizations/${id}`)),
};

let puzzleCategoryId: string;
let outdoorCategoryId: string;
let hiddenCategoryId: string;

const receivingPoint = (overrides: Record<string, unknown> = {}) => ({
  province: 'TP. Hồ Chí Minh',
  ward: 'Phường Nhiêu Lộc',
  street: '123 Lê Văn Sỹ',
  openingHours: 'Thứ 2 – Thứ 7, 8:00 – 17:00',
  contactName: 'Nguyễn Thị Lan',
  contactPhone: '0912345678',
  acceptsDropOff: true,
  acceptsParcel: false,
  ...overrides,
});

const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Mái ấm Hoa Hồng',
  address: '123 Lê Văn Sỹ, Phường Nhiêu Lộc',
  contactInfo: 'Chị Lan, phụ trách tiếp nhận',
  supportCriteria: 'Sách tranh và đồ chơi xếp hình còn dùng tốt.',
  receivingPoint: receivingPoint(),
  ageGroups: [{ minAge: 3, maxAge: 6 }],
  categoryIds: [puzzleCategoryId],
  ...overrides,
});

const createOrganization = async (overrides: Record<string, unknown> = {}) => {
  const response = await adminApi.create(validBody(overrides));
  expect(response.status).toBe(201);
  return response.body.data as { id: string; [key: string]: unknown };
};

const addDonationRequest = (organizationId: string, status: string) =>
  DonationRequest.create({
    code: `DN-${new Types.ObjectId().toString()}`,
    toyId: new Types.ObjectId(),
    donorId: new Types.ObjectId(),
    requestedBy: new Types.ObjectId(),
    receiver: { organizationId },
    itemDetails: 'Đồ chơi xếp hình',
    deliveryMethod: 'shipping',
    status,
  });

beforeEach(async () => {
  await Promise.all([
    Organization.deleteMany({}),
    DonationRequest.deleteMany({}),
    AuditLog.collection.deleteMany({}),
    Category.deleteMany({}),
  ]);
  const [puzzle, outdoor, hidden] = await Category.create([
    { name: 'Xếp hình', slug: 'xep-hinh' },
    { name: 'Vận động', slug: 'van-dong' },
    { name: 'Đã ẩn', slug: 'da-an', status: 'hidden' },
  ]);
  puzzleCategoryId = String(puzzle!._id);
  outdoorCategoryId = String(outdoor!._id);
  hiddenCategoryId = String(hidden!._id);
});

describe('admin create and edit', () => {
  it('creates an active organization with develop field names and writes an audit log', async () => {
    const created = await createOrganization();
    expect(created).toMatchObject({
      status: 'active',
      contactInfo: 'Chị Lan, phụ trách tiếp nhận',
      openRequestCount: 0,
      requestCount: 0,
    });
    const stored = await Organization.findById(created.id).lean();
    expect(stored?.contact_info).toBe('Chị Lan, phụ trách tiếp nhận');
    expect(stored?.support_criteria).toBe('Sách tranh và đồ chơi xếp hình còn dùng tốt.');
    const audit = await AuditLog.findOne({ action: 'organization.create' }).lean();
    expect(audit?.target_type).toBe('ORGANIZATION');
    expect(String(audit?.target_id)).toBe(created.id);
  });

  it('rejects invalid bodies', async () => {
    const response = await adminApi.create(validBody({ name: 'a', extra: 1 }));
    expect(response.status).toBe(400);
    const missing = await adminApi.create({ name: 'Mái ấm' });
    expect(missing.status).toBe(400);
    const fields = (missing.body.error.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        'address',
        'contactInfo',
        'receivingPoint',
        'ageGroups',
        'categoryIds',
      ]),
    );
  });

  it('refuses a duplicate name (409)', async () => {
    await createOrganization();
    const response = await adminApi.create(validBody());
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORGANIZATION_NAME_TAKEN');
  });

  it('refuses a name that differs only in letter case or accents, on create and on edit', async () => {
    const first = await createOrganization();
    const name = 'Mái ấm Hoa Hồng';
    const upper = await adminApi.create(validBody({ name: name.toUpperCase() }));
    const plain = await adminApi.create(
      validBody({
        name: name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'),
      }),
    );
    expect([upper.status, upper.body.error?.code]).toEqual([409, 'ORGANIZATION_NAME_TAKEN']);
    expect([plain.status, plain.body.error?.code]).toEqual([409, 'ORGANIZATION_NAME_TAKEN']);
    expect(await Organization.countDocuments()).toBe(1);

    const other = await adminApi.create(validBody({ name: 'Làng trẻ SOS Gò Vấp' }));
    const rename = await adminApi.update(other.body.data.id, { name: name.toLowerCase() });
    expect([rename.status, rename.body.error?.code]).toEqual([409, 'ORGANIZATION_NAME_TAKEN']);
    // Renaming an organization to its own name in another letter case is allowed.
    const own = await adminApi.update(first.id, { name: name.toUpperCase() });
    expect(own.status).toBe(200);
  });

  it('updates fields and audits the change', async () => {
    const created = await createOrganization();
    const response = await adminApi.update(created.id, { contactInfo: 'Anh Minh' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ contactInfo: 'Anh Minh' });
    expect(await AuditLog.countDocuments({ action: 'organization.update' })).toBe(1);
  });

  it('answers 404 for an unknown id and 400 for an empty update', async () => {
    const missing = new Types.ObjectId().toString();
    expect((await adminApi.update(missing, { contactInfo: 'Anh Minh' })).status).toBe(404);
    expect((await adminApi.get(missing)).status).toBe(404);
    const created = await createOrganization();
    expect((await adminApi.update(created.id, {})).status).toBe(400);
  });
});

describe('receiving point and needs profile (GB-51, GB-53)', () => {
  it('stores the point and the needs, with accepting on and remote area off by default', async () => {
    const created = await createOrganization({ supportCriteria: undefined });
    expect(created).toMatchObject({
      supportCriteria: null,
      receivingPoint: {
        province: 'TP. Hồ Chí Minh',
        ward: 'Phường Nhiêu Lộc',
        street: '123 Lê Văn Sỹ',
        contactName: 'Nguyễn Thị Lan',
        contactPhone: '+84912345678',
        acceptsDropOff: true,
        acceptsParcel: false,
      },
      ageGroups: [{ minAge: 3, maxAge: 6 }],
      categoryIds: [puzzleCategoryId],
      areaProvince: 'TP. Hồ Chí Minh',
      isRemoteArea: false,
      isAccepting: true,
    });
    const stored = await Organization.findById(created.id).lean();
    expect(stored?.receivingPoint?.contactPhone).toBe('+84912345678');
    expect(stored?.isAccepting).toBe(true);
    expect(stored?.areaProvince).toBe('TP. Hồ Chí Minh');
  });

  it('needs at least one handover method at the receiving point (GB-51)', async () => {
    const response = await adminApi.create(
      validBody({ receivingPoint: receivingPoint({ acceptsDropOff: false }) }),
    );
    expect(response.status).toBe(400);
    const fields = (response.body.error.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toContain('receivingPoint.acceptsDropOff');
  });

  it('refuses a district, a bad phone and an unknown age group', async () => {
    const district = await adminApi.create(
      validBody({ receivingPoint: receivingPoint({ district: 'Quận 3' }) }),
    );
    expect(district.status).toBe(400);
    const phone = await adminApi.create(
      validBody({ receivingPoint: receivingPoint({ contactPhone: '12345' }) }),
    );
    expect(phone.status).toBe(400);
    for (const ageGroups of [
      [{ minAge: 0, maxAge: 2 }],
      [],
      [
        { minAge: 3, maxAge: 6 },
        { minAge: 3, maxAge: 6 },
      ],
    ]) {
      expect((await adminApi.create(validBody({ ageGroups }))).status).toBe(400);
    }
  });

  it('accepts only Active categories (422 CATEGORY_NOT_FOUND)', async () => {
    for (const id of [hiddenCategoryId, new Types.ObjectId().toString()]) {
      const response = await adminApi.create(validBody({ categoryIds: [puzzleCategoryId, id] }));
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    }
    expect(await Organization.countDocuments()).toBe(0);
  });

  it('switches accepting toys off and audits it (GB-55)', async () => {
    const { id } = await createOrganization();
    const response = await adminApi.update(id, { isAccepting: false, isRemoteArea: true });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ isAccepting: false, isRemoteArea: true });
    expect(await AuditLog.countDocuments({ action: 'organization.update' })).toBe(1);
  });

  it('keeps an organization saved before the new fields working, and lets the Admin fill them', async () => {
    const legacy = await Organization.collection.insertOne({
      name: 'Nhà mở cũ',
      address: '9 Nguyễn Trãi, Hà Nội',
      contact_info: 'Anh Minh 0987654321',
      support_criteria: 'Đồ chơi gỗ',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const id = String(legacy.insertedId);

    const detail = await adminApi.get(id);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      receivingPoint: null,
      ageGroups: [],
      categoryIds: [],
      areaProvince: null,
      isRemoteArea: false,
      isAccepting: true,
    });
    // GB-51: Donors do not see an organization without a receiving point.
    const publicList = await request(app).get('/api/v1/organizations');
    expect(publicList.body.data).toEqual([]);

    const edited = await adminApi.update(id, {
      receivingPoint: receivingPoint({ province: 'Hà Nội' }),
      ageGroups: [{ minAge: 0, maxAge: 1 }],
      categoryIds: [outdoorCategoryId],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      receivingPoint: { province: 'Hà Nội' },
      areaProvince: 'Hà Nội',
      ageGroups: [{ minAge: 0, maxAge: 1 }],
    });
    const listedNow = await request(app).get('/api/v1/organizations');
    expect(listedNow.body.data.map((o: { name: string }) => o.name)).toEqual(['Nhà mở cũ']);
  });
});

describe('admin access', () => {
  it('needs a signed-in Admin', async () => {
    expect((await request(app).get('/api/v1/admin/organizations')).status).toBe(401);
    const asUser = await as('USER', request(app).post('/api/v1/admin/organizations')).send(
      validBody(),
    );
    expect(asUser.status).toBe(403);
  });
});

describe('hide and show', () => {
  it('moves active <-> hidden and refuses repeating a move (409)', async () => {
    const { id } = await createOrganization();
    const hidden = await adminApi.hide(id);
    expect(hidden.status).toBe(200);
    expect(hidden.body.data.status).toBe('hidden');

    const again = await adminApi.hide(id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ORGANIZATION_ALREADY_HIDDEN');

    const shown = await adminApi.show(id);
    expect(shown.body.data.status).toBe('active');
    expect((await adminApi.show(id)).body.error.code).toBe('ORGANIZATION_ALREADY_VISIBLE');

    const actions = await AuditLog.find({ target_id: id }).distinct('action');
    expect(actions.sort()).toEqual([
      'organization.create',
      'organization.hide',
      'organization.show',
    ]);
  });

  it('lets only one of two concurrent hides succeed', async () => {
    const { id } = await createOrganization();
    const results = await Promise.all([adminApi.hide(id), adminApi.hide(id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await AuditLog.countDocuments({ action: 'organization.hide' })).toBe(1);
  });

  it('keeps running requests when hiding and says so', async () => {
    const { id } = await createOrganization();
    await addDonationRequest(id, 'pending');
    const response = await adminApi.hide(id);
    expect(response.status).toBe(200);
    expect(response.body.data.openRequestCount).toBe(1);
    expect(response.body.message).toContain('1 yêu cầu');
  });
});

describe('delete', () => {
  it('deletes an organization without donation requests', async () => {
    const { id } = await createOrganization();
    expect((await adminApi.remove(id)).status).toBe(200);
    expect(await Organization.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'organization.delete' })).toBe(1);
    expect((await adminApi.remove(id)).status).toBe(404);
  });

  it('refuses with open requests, and with closed ones (history kept)', async () => {
    const open = await createOrganization();
    await addDonationRequest(open.id, 'shipping');
    const openResponse = await adminApi.remove(open.id);
    expect(openResponse.status).toBe(409);
    expect(openResponse.body.error).toMatchObject({
      code: 'ORGANIZATION_HAS_OPEN_REQUESTS',
      details: { openRequestCount: 1, requestCount: 1 },
    });

    const closed = await createOrganization({ name: 'Làng trẻ SOS' });
    await addDonationRequest(closed.id, 'completed');
    const closedResponse = await adminApi.remove(closed.id);
    expect(closedResponse.status).toBe(409);
    expect(closedResponse.body.error.code).toBe('ORGANIZATION_IN_USE');
    expect(await Organization.countDocuments()).toBe(2);
  });

  it('shows the request counts in the admin list', async () => {
    const { id } = await createOrganization();
    await addDonationRequest(id, 'pending');
    await addDonationRequest(id, 'rejected');
    const response = await adminApi.list();
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ openRequestCount: 1, requestCount: 2 });
    expect(response.body.pagination.totalItems).toBe(1);
  });
});

describe('public list', () => {
  beforeEach(async () => {
    await createOrganization();
    await createOrganization({
      name: 'Làng trẻ SOS Hà Nội',
      supportCriteria: 'Đồ chơi cho bé dưới 2 tuổi.',
    });
    const hidden = await createOrganization({ name: 'Nhà mở ẩn' });
    await adminApi.hide(hidden.id);
  });

  it('lists only active organizations, sorted by name, without admin fields', async () => {
    const response = await request(app).get('/api/v1/organizations');
    expect(response.status).toBe(200);
    expect(response.body.data.map((o: { name: string }) => o.name)).toEqual([
      'Làng trẻ SOS Hà Nội',
      'Mái ấm Hoa Hồng',
    ]);
    expect(response.body.data[0].status).toBeUndefined();
  });

  it('returns no contact details (GB-62): only the public part of the receiving point', async () => {
    const list = await request(app).get('/api/v1/organizations');
    const detail = await request(app).get(
      `/api/v1/organizations/${list.body.data[0].id as string}`,
    );
    for (const organization of [list.body.data[0], detail.body.data]) {
      expect(organization).not.toHaveProperty('contactInfo');
      expect(organization.receivingPoint).toMatchObject({
        street: '123 Lê Văn Sỹ',
        openingHours: 'Thứ 2 – Thứ 7, 8:00 – 17:00',
      });
      expect(organization.receivingPoint).not.toHaveProperty('contactName');
      expect(organization.receivingPoint).not.toHaveProperty('contactPhone');
      expect(JSON.stringify(organization)).not.toContain('912345678');
    }
  });

  it('leaves out organizations that are not accepting toys (GB-51)', async () => {
    const closed = await Organization.findOne({ name: 'Mái ấm Hoa Hồng' }).lean();
    await adminApi.update(String(closed?._id), { isAccepting: false });
    const response = await request(app).get('/api/v1/organizations');
    expect(response.body.data.map((o: { name: string }) => o.name)).toEqual([
      'Làng trẻ SOS Hà Nội',
    ]);
    expect((await request(app).get(`/api/v1/organizations/${String(closed?._id)}`)).status).toBe(
      200,
    );
  });

  it('filters by province, age group, category and remote area (GB-52)', async () => {
    await createOrganization({
      name: 'Điểm trường vùng cao',
      receivingPoint: receivingPoint({ province: 'Hà Giang', acceptsParcel: true }),
      ageGroups: [{ minAge: 6, maxAge: 12 }],
      categoryIds: [outdoorCategoryId],
      isRemoteArea: true,
    });
    const names = async (query: Record<string, string>) =>
      (await request(app).get('/api/v1/organizations').query(query)).body.data.map(
        (o: { name: string }) => o.name,
      );
    expect(await names({ province: 'ha giang' })).toEqual(['Điểm trường vùng cao']);
    expect(await names({ minAge: '6', maxAge: '8' })).toEqual(['Điểm trường vùng cao']);
    // Half-open: [3, 6) and [6, 12) do not share 6.
    expect(await names({ minAge: '0', maxAge: '6' })).not.toContain('Điểm trường vùng cao');
    expect(await names({ categoryId: puzzleCategoryId })).toEqual([
      'Làng trẻ SOS Hà Nội',
      'Mái ấm Hoa Hồng',
    ]);
    expect(await names({ remoteOnly: 'true' })).toEqual(['Điểm trường vùng cao']);
  });

  it('searches accent-free and refuses unknown query keys', async () => {
    const bySearch = await request(app).get('/api/v1/organizations').query({ q: 'hoa hong' });
    expect(bySearch.body.data).toHaveLength(1);
    const invalid = await request(app).get('/api/v1/organizations').query({ district: 'Quận 3' });
    expect(invalid.status).toBe(400);
  });

  it('hides hidden organizations from the detail endpoint (404)', async () => {
    expect(
      (await request(app).get('/api/v1/organizations').query({ minAge: '5', maxAge: '2' })).status,
    ).toBe(400);
    const hidden = await Organization.findOne({ status: 'hidden' }).lean();
    const response = await request(app).get(`/api/v1/organizations/${String(hidden?._id)}`);
    expect(response.status).toBe(404);
  });
});

describe('suggestions (GB-54)', () => {
  const suggest = (query: Record<string, string>) =>
    request(app).get('/api/v1/organizations/suggestions').query(query);
  const names = async (query: Record<string, string>) => {
    const response = await suggest(query);
    expect(response.status).toBe(200);
    return response.body.data.map((o: { name: string }) => o.name) as string[];
  };

  beforeEach(async () => {
    await createOrganization({ name: 'B Sài Gòn' });
    await createOrganization({
      name: 'A Hà Nội',
      receivingPoint: receivingPoint({ province: 'Hà Nội' }),
      ageGroups: [
        { minAge: 1, maxAge: 3 },
        { minAge: 3, maxAge: 6 },
      ],
    });
    await createOrganization({ name: 'C Vận động', categoryIds: [outdoorCategoryId] });
    const closed = await createOrganization({ name: 'D Tạm ngừng' });
    await adminApi.update(closed.id, { isAccepting: false });
    const hidden = await createOrganization({ name: 'E Đã ẩn' });
    await adminApi.hide(hidden.id);
    await createOrganization({
      name: 'F Tuổi lớn',
      ageGroups: [
        { minAge: 6, maxAge: 12 },
        { minAge: 12, maxAge: 99 },
      ],
    });
  });

  it('matches the age range and the category of active, accepting organizations', async () => {
    expect(await names({ categoryId: puzzleCategoryId, minAge: '3', maxAge: '5' })).toEqual([
      'A Hà Nội',
      'B Sài Gòn',
    ]);
    expect(await names({ categoryId: outdoorCategoryId, minAge: '4', maxAge: '4' })).toEqual([
      'C Vận động',
    ]);
  });

  it('uses half-open age groups like the toys: [3, 6) does not take a 6–12 toy', async () => {
    expect(await names({ categoryId: puzzleCategoryId, minAge: '6', maxAge: '12' })).toEqual([
      'F Tuổi lớn',
    ]);
    expect(await names({ categoryId: puzzleCategoryId, minAge: '13', maxAge: '15' })).toEqual([
      'F Tuổi lớn',
    ]);
  });

  it("puts the Donor's province first, accents ignored", async () => {
    expect(
      await names({
        categoryId: puzzleCategoryId,
        minAge: '3',
        maxAge: '5',
        province: 'tp. ho chi minh',
      }),
    ).toEqual(['B Sài Gòn', 'A Hà Nội']);
  });

  it('returns no contact details and validates the query', async () => {
    const response = await suggest({ categoryId: puzzleCategoryId, minAge: '3', maxAge: '5' });
    expect(response.body.data[0]).not.toHaveProperty('contactInfo');
    expect(response.body.data[0].receivingPoint).not.toHaveProperty('contactPhone');
    expect((await suggest({ minAge: '3', maxAge: '5' })).status).toBe(400);
    expect((await suggest({ categoryId: puzzleCategoryId, minAge: '6', maxAge: '3' })).status).toBe(
      400,
    );
    expect(await names({ categoryId: hiddenCategoryId, minAge: '3', maxAge: '5' })).toEqual([]);
  });
});

describe('backfill of the 17/11/2026 defaults', () => {
  it('sets only missing fields and can run again', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    await Organization.collection.insertMany([
      {
        name: 'Cũ',
        address: '1 Phố Huế',
        contact_info: 'x',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        name: 'Đã tắt',
        address: '2 Phố Huế',
        contact_info: 'x',
        status: 'active',
        isAccepting: false,
        receivingPoint: receivingPoint({ province: 'Huế' }),
        createdAt: now,
        updatedAt: now,
      },
    ]);
    expect(await backfillOrganizationDefaults()).toEqual({
      isAccepting: 1,
      isRemoteArea: 2,
      areaProvince: 1,
    });
    const [old, closed] = await Promise.all([
      Organization.findOne({ name: 'Cũ' }).lean(),
      Organization.findOne({ name: 'Đã tắt' }).lean(),
    ]);
    expect(old).toMatchObject({ isAccepting: true, isRemoteArea: false, updatedAt: now });
    expect(old?.areaProvince).toBeUndefined();
    expect(closed).toMatchObject({ isAccepting: false, areaProvince: 'Huế' });
    expect(await backfillOrganizationDefaults()).toEqual({
      isAccepting: 0,
      isRemoteArea: 0,
      areaProvince: 0,
    });
  });
});

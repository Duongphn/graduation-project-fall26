import express from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTestDatabase } from '../database/helpers.js';

// env is read once on import: enable the development auth headers before loading the app.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DEV_AUTH = 'true';
  process.env.CLOUDINARY_CLOUD_NAME = 'toyflow';
});

const { adminOrganizationsRouter, organizationsRouter } =
  await import('../../src/features/organizations/index.js');
const { isOrganizationLogoUrl } =
  await import('../../src/features/organizations/domain/organization-rules.js');
const { OrganizationModel } =
  await import('../../src/features/organizations/organizations.model.js');
const { AuditLogModel } = await import('../../src/features/audit_logs/audit_logs.model.js');
const { DonationRequestModel } =
  await import('../../src/features/donation_requests/donation_requests.model.js');
const { errorHandler } = await import('../../src/shared/middleware/error-handler.js');
const { UserModel } = await import('../../src/features/users/users.model.js');

useTestDatabase();

const app = express();
app.use(express.json());
app.use('/api/v1/admin/organizations', adminOrganizationsRouter);
app.use('/api/v1/organizations', organizationsRouter);
app.use(errorHandler);

const ADMIN_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();
const LOGO = 'https://res.cloudinary.com/toyflow/image/upload/v17/toyflow/organizations/a.png';

// Development auth reads the caller's role from the users collection.
beforeAll(async () => {
  await UserModel.create([
    {
      _id: ADMIN_ID,
      phone: '+84910000001',
      email: 'admin@example.com',
      passwordHash: 'x',
      fullName: 'Admin',
      role: 'ADMIN',
    },
    {
      _id: USER_ID,
      phone: '+84910000002',
      email: 'user@example.com',
      passwordHash: 'x',
      fullName: 'User',
    },
  ]);
});

const as = (role: 'ADMIN' | 'USER', test: request.Test) =>
  test.set('x-dev-user-id', role === 'ADMIN' ? ADMIN_ID : USER_ID).set('x-dev-role', role);

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

const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Mái ấm Hoa Hồng',
  address: '123 Lê Văn Sỹ, Phường Nhiêu Lộc',
  province: 'Hồ Chí Minh',
  phone: '0912 345 678',
  contactInfo: 'Chị Lan, phụ trách tiếp nhận',
  supportCriteria: 'Sách tranh và đồ chơi xếp hình còn dùng tốt.',
  ageGroups: ['AGE_6_8', 'AGE_3_5'],
  ...overrides,
});

const createOrganization = async (overrides: Record<string, unknown> = {}) => {
  const response = await adminApi.create(validBody(overrides));
  expect(response.status).toBe(201);
  return response.body.data as { id: string; [key: string]: unknown };
};

const addDonationRequest = (organizationId: string, status: string) =>
  DonationRequestModel.create({
    code: `DN-${new Types.ObjectId().toString()}`,
    toyId: new Types.ObjectId(),
    donorId: new Types.ObjectId(),
    requestedBy: new Types.ObjectId(),
    receiverType: 'ORGANIZATION',
    organizationId,
    status,
  });

beforeEach(async () => {
  await Promise.all([
    OrganizationModel.deleteMany({}),
    DonationRequestModel.deleteMany({}),
    AuditLogModel.collection.deleteMany({}),
  ]);
});

describe('admin create and edit', () => {
  it('creates an ACTIVE organization, normalizes the phone and writes an audit log', async () => {
    const created = await createOrganization({ logoUrl: LOGO });
    expect(created).toMatchObject({
      status: 'ACTIVE',
      phone: '+84912345678',
      phoneMasked: '+8491***5678',
      ageGroups: ['AGE_3_5', 'AGE_6_8'],
      logoUrl: LOGO,
      openRequestCount: 0,
      requestCount: 0,
    });
    const audit = await AuditLogModel.findOne({ action: 'organization.create' }).lean();
    expect(audit?.target).toMatchObject({ kind: 'ORGANIZATION' });
    expect(String(audit?.target.id)).toBe(created.id);
    expect(JSON.stringify(audit?.meta)).not.toContain('912345678');
  });

  it('rejects invalid bodies', async () => {
    const response = await adminApi.create(
      validBody({ phone: '123', province: 'Atlantis', ageGroups: [], extra: 1 }),
    );
    expect(response.status).toBe(400);
    const fields = (response.body.error.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['phone', 'province', 'ageGroups']));
  });

  it('accepts only logos from the signed organization upload folder', async () => {
    expect(isOrganizationLogoUrl(LOGO, 'toyflow')).toBe(true);
    expect(isOrganizationLogoUrl('https://evil.example.com/toyflow/organizations/a.png')).toBe(
      false,
    );
    expect(
      isOrganizationLogoUrl(
        'https://res.cloudinary.com/other/image/upload/toyflow/organizations/a.png',
        'toyflow',
      ),
    ).toBe(false);
    expect(
      isOrganizationLogoUrl(
        'https://res.cloudinary.com/toyflow/image/upload/toyflow/toys/a.png',
        'toyflow',
      ),
    ).toBe(false);
    const response = await adminApi.create(validBody({ logoUrl: 'http://tracker.example/x.png' }));
    expect(response.status).toBe(400);
  });

  it('refuses a duplicate name regardless of case (409)', async () => {
    await createOrganization();
    const response = await adminApi.create(validBody({ name: 'MÁI ẤM HOA HỒNG' }));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORGANIZATION_NAME_TAKEN');
  });

  it('updates fields, clears optional ones and audits only the changes', async () => {
    const created = await createOrganization({ logoUrl: LOGO, description: 'Nhà mở' });
    const response = await adminApi.update(created.id, {
      contactInfo: 'Anh Minh',
      logoUrl: null,
      description: null,
    });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      contactInfo: 'Anh Minh',
      logoUrl: null,
      description: null,
    });
    const audit = await AuditLogModel.findOne({ action: 'organization.update' }).lean();
    expect(Object.keys((audit?.meta as { after: object }).after).sort()).toEqual([
      'contactInfo',
      'description',
      'logoUrl',
    ]);
  });

  it('answers 404 for an unknown id and 400 for an empty update', async () => {
    const missing = new Types.ObjectId().toString();
    expect((await adminApi.update(missing, { contactInfo: 'Anh Minh' })).status).toBe(404);
    expect((await adminApi.get(missing)).status).toBe(404);
    const created = await createOrganization();
    expect((await adminApi.update(created.id, {})).status).toBe(400);
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
  it('moves ACTIVE <-> HIDDEN and refuses repeating a move (409)', async () => {
    const { id } = await createOrganization();
    const hidden = await adminApi.hide(id);
    expect(hidden.status).toBe(200);
    expect(hidden.body.data.status).toBe('HIDDEN');

    const again = await adminApi.hide(id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ORGANIZATION_ALREADY_HIDDEN');

    const shown = await adminApi.show(id);
    expect(shown.body.data.status).toBe('ACTIVE');
    expect((await adminApi.show(id)).body.error.code).toBe('ORGANIZATION_ALREADY_VISIBLE');

    const actions = await AuditLogModel.find({ 'target.id': id }).distinct('action');
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
    expect(await AuditLogModel.countDocuments({ action: 'organization.hide' })).toBe(1);
  });

  it('keeps running requests when hiding and says so', async () => {
    const { id } = await createOrganization();
    await addDonationRequest(id, 'PENDING');
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
    expect(await OrganizationModel.countDocuments()).toBe(0);
    expect(await AuditLogModel.countDocuments({ action: 'organization.delete' })).toBe(1);
    expect((await adminApi.remove(id)).status).toBe(404);
  });

  it('refuses with open requests, and with closed ones (history kept)', async () => {
    const open = await createOrganization();
    await addDonationRequest(open.id, 'SHIPPING');
    const openResponse = await adminApi.remove(open.id);
    expect(openResponse.status).toBe(409);
    expect(openResponse.body.error).toMatchObject({
      code: 'ORGANIZATION_HAS_OPEN_REQUESTS',
      details: { openRequestCount: 1, requestCount: 1 },
    });

    const closed = await createOrganization({ name: 'Làng trẻ SOS' });
    await addDonationRequest(closed.id, 'COMPLETED');
    const closedResponse = await adminApi.remove(closed.id);
    expect(closedResponse.status).toBe(409);
    expect(closedResponse.body.error.code).toBe('ORGANIZATION_IN_USE');
    expect(await OrganizationModel.countDocuments()).toBe(2);
  });

  it('shows the request counts in the admin list', async () => {
    const { id } = await createOrganization();
    await addDonationRequest(id, 'PENDING');
    await addDonationRequest(id, 'REJECTED');
    const response = await adminApi.list();
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ openRequestCount: 1, requestCount: 2 });
    expect(response.body.data[0].phone).toBeUndefined();
    expect(response.body.pagination.totalItems).toBe(1);
  });
});

describe('public list', () => {
  beforeEach(async () => {
    await createOrganization();
    await createOrganization({
      name: 'Làng trẻ SOS Hà Nội',
      province: 'Hà Nội',
      ageGroups: ['AGE_0_2'],
      supportCriteria: 'Đồ chơi cho bé dưới 2 tuổi.',
    });
    const hidden = await createOrganization({ name: 'Nhà mở ẩn', province: 'Hà Nội' });
    await adminApi.hide(hidden.id);
  });

  it('lists only ACTIVE organizations, sorted by name', async () => {
    const response = await request(app).get('/api/v1/organizations');
    expect(response.status).toBe(200);
    expect(response.body.data.map((o: { name: string }) => o.name)).toEqual([
      'Làng trẻ SOS Hà Nội',
      'Mái ấm Hoa Hồng',
    ]);
  });

  it('filters by province, age group and accent-free search', async () => {
    const byProvince = await request(app)
      .get('/api/v1/organizations')
      .query({ province: 'Hà Nội' });
    expect(byProvince.body.data).toHaveLength(1);
    const byAge = await request(app).get('/api/v1/organizations').query({ ageGroup: 'AGE_6_8' });
    expect(byAge.body.data.map((o: { name: string }) => o.name)).toEqual(['Mái ấm Hoa Hồng']);
    const bySearch = await request(app).get('/api/v1/organizations').query({ q: 'hoa hong' });
    expect(bySearch.body.data).toHaveLength(1);
    const invalid = await request(app).get('/api/v1/organizations').query({ ageGroup: 'AGE_99' });
    expect(invalid.status).toBe(400);
  });

  it('returns the phone only to signed-in callers', async () => {
    const anonymous = await request(app).get('/api/v1/organizations');
    expect(anonymous.body.data[0].phone).toBeUndefined();
    const signedIn = await as('USER', request(app).get('/api/v1/organizations'));
    expect(signedIn.body.data[0].phone).toBe('+84912345678');
  });

  it('hides HIDDEN organizations from the detail endpoint (404)', async () => {
    const hidden = await OrganizationModel.findOne({ status: 'HIDDEN' }).lean();
    const response = await request(app).get(`/api/v1/organizations/${String(hidden?._id)}`);
    expect(response.status).toBe(404);
  });
});

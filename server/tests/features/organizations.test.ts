import express from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuditLog } from '../../src/models/audit-log.model.js';
import { DonationRequest } from '../../src/models/donation-request.model.js';
import {
  adminOrganizationsRouter,
  organizationsRouter,
} from '../../src/routes/organization.routes.js';
import { Organization } from '../../src/models/organization.model.js';
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

const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Mái ấm Hoa Hồng',
  address: '123 Lê Văn Sỹ, Phường Nhiêu Lộc',
  contactInfo: 'Chị Lan, phụ trách tiếp nhận',
  supportCriteria: 'Sách tranh và đồ chơi xếp hình còn dùng tốt.',
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
    AuditLog.deleteMany({}),
  ]);
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
    expect(fields).toEqual(expect.arrayContaining(['address', 'contactInfo', 'supportCriteria']));
  });

  it('refuses a duplicate name (409)', async () => {
    await createOrganization();
    const response = await adminApi.create(validBody());
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ORGANIZATION_NAME_TAKEN');
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

  it('searches accent-free and refuses unknown query keys', async () => {
    const bySearch = await request(app).get('/api/v1/organizations').query({ q: 'hoa hong' });
    expect(bySearch.body.data).toHaveLength(1);
    const invalid = await request(app).get('/api/v1/organizations').query({ province: 'Hà Nội' });
    expect(invalid.status).toBe(400);
  });

  it('hides hidden organizations from the detail endpoint (404)', async () => {
    const hidden = await Organization.findOne({ status: 'hidden' }).lean();
    const response = await request(app).get(`/api/v1/organizations/${String(hidden?._id)}`);
    expect(response.status).toBe(404);
  });
});

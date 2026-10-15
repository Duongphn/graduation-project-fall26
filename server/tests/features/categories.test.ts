import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuditLogModel } from '../../src/features/audit_logs/audit_logs.model.js';
import { CategoryModel } from '../../src/features/categories/categories.model.js';
import { adminCategoriesRouter, categoriesRouter } from '../../src/features/categories/index.js';
import { SystemSettingModel } from '../../src/features/system_settings/system_settings.model.js';
import { ToyModel } from '../../src/features/toys/toys.model.js';
import { errorHandler } from '../../src/shared/middleware/error-handler.js';
import {
  seedDefaultCategories,
  defaultCategories,
} from '../../src/features/categories/categories.seed.js';
import { createToy, newId, useTestDatabase } from '../database/helpers.js';

useTestDatabase();

const ADMIN_ID = newId().toString();
const BASE = '/api/v1/admin/categories';

// Stand-in for the JWT middleware: x-test-user / x-test-role set request.auth.
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = req.header('x-test-user');
  const role = req.header('x-test-role');
  if (userId) req.auth = { userId, role: role === 'ADMIN' ? 'ADMIN' : 'USER' };
  next();
});
app.use('/api/v1/categories', categoriesRouter);
app.use(BASE, adminCategoriesRouter);
app.use(errorHandler);

const asAdmin = (test: request.Test) =>
  test.set('x-test-user', ADMIN_ID).set('x-test-role', 'ADMIN');
const get = (path = '') => asAdmin(request(app).get(`${BASE}${path}`));
const post = (path = '', body: object = {}) =>
  asAdmin(request(app).post(`${BASE}${path}`)).send(body);
const patch = (path: string, body: object) =>
  asAdmin(request(app).patch(`${BASE}${path}`)).send(body);
const del = (path: string) => asAdmin(request(app).delete(`${BASE}${path}`));

const createCategory = async (name: string, extra: object = {}) => {
  const response = await post('', { name, ...extra });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; slug: string; displayOrder: number };
};

beforeEach(async () => {
  await Promise.all([
    CategoryModel.deleteMany({}),
    ToyModel.deleteMany({}),
    AuditLogModel.collection.deleteMany({}),
  ]);
});

describe('guards and validation', () => {
  it('answers 401 without a user and 403 for a non-Admin', async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
    const asUser = await request(app).get(BASE).set('x-test-user', newId().toString());
    expect(asUser.status).toBe(403);
  });

  it('rejects invalid bodies, ids and unknown query keys', async () => {
    const short = await post('', { name: ' a ' });
    expect(short.status).toBe(400);
    expect(short.body.error.details[0].field).toBe('name');
    expect((await post('', { name: 'Gỗ', extra: 1 })).status).toBe(400);
    expect((await patch('/not-an-id', { name: 'Xe' })).status).toBe(400);
    expect((await patch(`/${newId()}`, {})).status).toBe(400);
    expect((await get('?sortBy=name')).status).toBe(400);
    expect((await patch('/reorder', { ids: [String(newId()), ''] })).status).toBe(400);
  });

  it('answers 404 for an unknown category', async () => {
    const id = String(newId());
    expect((await patch(`/${id}`, { name: 'Khác' })).body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect((await post(`/${id}/hide`)).status).toBe(404);
    expect((await del(`/${id}`)).status).toBe(404);
    expect((await patch('/reorder', { ids: [id] })).status).toBe(404);
  });
});

describe('create and edit', () => {
  it('creates at the end of the list with a slug and an audit log', async () => {
    const first = await createCategory('Đồ chơi gỗ', { description: '  Tự nhiên ' });
    const second = await createCategory('Xe   điều khiển');
    expect(first).toMatchObject({
      slug: 'do-choi-go',
      displayOrder: 1,
      toyCount: 0,
      canDelete: true,
    });
    expect(second).toMatchObject({ name: 'Xe điều khiển', displayOrder: 2 });

    const audit = await AuditLogModel.findOne({ action: 'category.create' }).lean();
    expect(audit).toMatchObject({ actorType: 'ADMIN', target: { kind: 'CATEGORY' } });
    expect(String(audit?.actorId)).toBe(ADMIN_ID);
  });

  it('rejects a duplicate name ignoring case, but not accents', async () => {
    await createCategory('Lắp ráp');
    const duplicate = await post('', { name: 'LẮP RÁP' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatchObject({
      code: 'CATEGORY_NAME_TAKEN',
      details: [{ field: 'name' }],
    });
    const other = await createCategory('Lap rap');
    expect(other.slug).toBe('lap-rap-2');
  });

  it('turns two concurrent creates of one name into one 201 and one 409', async () => {
    const results = await Promise.all([post('', { name: 'Búp bê' }), post('', { name: 'búp bê' })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await CategoryModel.countDocuments()).toBe(1);
  });

  it('renames without changing the slug and removes the description', async () => {
    const category = await createCategory('Sách', { description: 'Truyện tranh' });
    await createCategory('Bóng');
    const renamed = await patch(`/${category.id}`, { name: 'Sách vải', description: null });
    expect(renamed.status).toBe(200);
    expect(renamed.body.message).toBe('Đã cập nhật danh mục.');
    expect(renamed.body.data).toMatchObject({ name: 'Sách vải', slug: 'sach' });
    expect(renamed.body.data.description).toBeUndefined();
    const clash = await patch(`/${category.id}`, { name: 'BÓNG' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('CATEGORY_NAME_TAKEN');
    expect(await AuditLogModel.countDocuments({ action: 'category.update' })).toBe(1);
  });
});

describe('hide, show and the public list', () => {
  it('hides and shows with conflicts on repeat, and lists only ACTIVE ones publicly', async () => {
    const wood = await createCategory('Gỗ');
    await createCategory('Nhựa');
    const hidden = await post(`/${wood.id}/hide`);
    expect(hidden.body).toMatchObject({ data: { status: 'HIDDEN' }, message: 'Đã ẩn danh mục.' });
    expect((await post(`/${wood.id}/hide`)).body.error.code).toBe('CATEGORY_ALREADY_HIDDEN');

    const publicList = await request(app).get('/api/v1/categories');
    expect(publicList.status).toBe(200);
    expect(publicList.body.data).toEqual([{ id: expect.any(String), name: 'Nhựa', slug: 'nhua' }]);

    expect((await post(`/${wood.id}/show`)).body.data.status).toBe('ACTIVE');
    expect((await post(`/${wood.id}/show`)).body.error.code).toBe('CATEGORY_ALREADY_VISIBLE');
    expect(
      await AuditLogModel.countDocuments({ action: { $in: ['category.hide', 'category.show'] } }),
    ).toBe(2);
  });

  it('lets only one of two concurrent hides succeed', async () => {
    const category = await createCategory('Xếp hình');
    const results = await Promise.all([post(`/${category.id}/hide`), post(`/${category.id}/hide`)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('does not expose admin fields publicly', async () => {
    await createCategory('Gỗ');
    const [item] = (await request(app).get('/api/v1/categories')).body.data;
    expect(Object.keys(item).sort()).toEqual(['id', 'name', 'slug']);
  });
});

describe('admin list', () => {
  it('paginates, filters and searches without accents, with toy counts', async () => {
    const remote = await createCategory('Xe điều khiển');
    const wood = await createCategory('Đồ gỗ');
    await post(`/${wood.id}/hide`);
    await createToy({ categoryId: remote.id, status: 'SOLD' });
    await createToy({ categoryId: remote.id });

    const all = await get();
    expect(all.body.pagination).toMatchObject({ page: 1, limit: 100, totalItems: 2 });
    expect(all.body.data[0]).toMatchObject({ id: remote.id, toyCount: 2, canDelete: false });

    expect((await get('?q=dieu khien')).body.data).toHaveLength(1);
    expect((await get('?status=HIDDEN')).body.data[0].id).toBe(wood.id);
    const paged = await get('?limit=1&page=2');
    expect(paged.body.data[0].id).toBe(wood.id);
  });
});

describe('delete', () => {
  it('deletes an unused category and refuses one used by any toy', async () => {
    const unused = await createCategory('Trống');
    const used = await createCategory('Đang dùng');
    await createToy({ categoryId: used.id, status: 'HIDDEN' });

    const deleted = await del(`/${unused.id}`);
    expect(deleted.body).toEqual({ success: true, data: null, message: 'Đã xoá danh mục.' });
    const refused = await del(`/${used.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: 'CATEGORY_IN_USE', details: { toyCount: 1 } });
    expect(await AuditLogModel.countDocuments({ action: 'category.delete' })).toBe(1);
  });
  // The race with a real toy save is in toy-categories.test.ts.
});

describe('reorder', () => {
  it('numbers the ids in the given order', async () => {
    const a = await createCategory('A gỗ');
    const b = await createCategory('B nhựa');
    const c = await createCategory('C vải');
    const response = await patch('/reorder', { ids: [c.id, a.id, b.id] });
    expect(response.status).toBe(200);
    const order = (await get()).body.data.map((item: { id: string; displayOrder: number }) => [
      item.id,
      item.displayOrder,
    ]);
    expect(order).toEqual([
      [c.id, 1],
      [a.id, 2],
      [b.id, 3],
    ]);
    const audit = await AuditLogModel.findOne({ action: 'category.reorder' }).lean();
    expect(audit?.target).toEqual({ kind: 'CATEGORY' });
    expect(audit?.meta).toMatchObject({ after: [c.id, a.id, b.id] });
  });

  it('answers 404 for an unknown id and changes nothing', async () => {
    const a = await createCategory('Có thật');
    const response = await patch('/reorder', { ids: [a.id, newId().toString()] });
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: 'CATEGORY_NOT_FOUND',
      message: 'Không tìm thấy 1 danh mục.',
    });
    expect(await AuditLogModel.countDocuments({ action: 'category.reorder' })).toBe(0);
  });

  it('answers 422 REORDER_INCOMPLETE for a partial list and changes nothing', async () => {
    const a = await createCategory('Một');
    const b = await createCategory('Hai');
    await createCategory('Ba');
    const response = await patch('/reorder', { ids: [b.id, a.id] });
    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({
      code: 'REORDER_INCOMPLETE',
      details: { missingCount: 1 },
    });
    const order = (await get()).body.data.map((item: { id: string }) => item.id);
    expect(order.slice(0, 2)).toEqual([a.id, b.id]);
    expect(await AuditLogModel.countDocuments({ action: 'category.reorder' })).toBe(0);
  });

  it('rejects duplicate ids', async () => {
    const a = await createCategory('Một');
    expect((await patch('/reorder', { ids: [a.id, a.id.toUpperCase()] })).status).toBe(400);
  });
});

describe('default categories seed', () => {
  beforeEach(async () => {
    await SystemSettingModel.deleteMany({ key: 'CATEGORIES_SEEDED' });
  });

  it('fills an empty collection once and is safe to run again', async () => {
    await seedDefaultCategories();
    await seedDefaultCategories();
    const seeded = await CategoryModel.find().sort({ displayOrder: 1 }).lean();
    expect(seeded.length).toBe(defaultCategories.length);
    expect(seeded.length).toBeGreaterThanOrEqual(10);
    expect(new Set(seeded.map((category) => category.slug)).size).toBe(seeded.length);
    expect(seeded.every((category) => category.status === 'ACTIVE')).toBe(true);
    expect(seeded.map((category) => category.displayOrder)).toEqual(
      seeded.map((_category, index) => index + 1),
    );
  });

  it('never brings back a deleted category nor undoes a rename', async () => {
    await seedDefaultCategories();
    const [first, second] = await CategoryModel.find().sort({ displayOrder: 1 });
    await CategoryModel.deleteOne({ _id: first?._id });
    await CategoryModel.updateOne({ _id: second?._id }, { name: 'Tên mới' });
    await seedDefaultCategories();
    expect(await CategoryModel.countDocuments()).toBe(defaultCategories.length - 1);
    expect((await CategoryModel.findById(second?._id).lean())?.name).toBe('Tên mới');
  });

  it('does not reseed after the Admin deleted every category', async () => {
    await seedDefaultCategories();
    await CategoryModel.deleteMany({});
    await seedDefaultCategories();
    expect(await CategoryModel.countDocuments()).toBe(0);
  });
});

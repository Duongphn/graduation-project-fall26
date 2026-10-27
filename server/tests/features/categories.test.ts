import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuditLog as AuditLogModel } from '../../src/models/audit-log.model.js';
import { Category as CategoryModel } from '../../src/models/category.model.js';
import { adminCategoriesRouter } from '../../src/routes/category-admin.routes.js';
import { categoriesRouter } from '../../src/routes/category.routes.js';
import { Toy as ToyModel } from '../../src/models/toy.model.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { testAuth } from '../support/test-auth.js';
import { newId, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const ADMIN_ID = newId().toString();
const BASE = '/api/v1/admin/categories';

// testAuth stands in for develop's JWT `authenticate`: x-test-user / x-test-role set req.auth.
const app = express();
app.use(express.json());
app.use(testAuth);

/** A toy with develop's toys schema. */
const createToy = (overrides: Record<string, unknown> = {}) =>
  ToyModel.create({
    ownerId: newId(),
    categoryId: newId(),
    title: 'Wooden train set',
    description: 'Complete set with 20 pieces.',
    condition: 'good',
    listingType: 'rent',
    priceOrRate: 20_000,
    depositPrice: 300_000,
    status: 'active',
    ageRange: { minAge: 3, maxAge: 5 },
    images: [{ url: 'https://example.com/1.jpg', publicId: 'toyflow/toys/1' }],
    ...overrides,
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
    expect(audit).toMatchObject({ target_type: 'CATEGORY' });
    expect(String(audit?.actor_id)).toBe(ADMIN_ID);
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
    expect((await patch(`/${category.id}`, { name: 'BÓNG' })).status).toBe(409);
  });
});

describe('hide, show and the public list', () => {
  it('hides and shows with conflicts on repeat, and lists only active ones publicly', async () => {
    const wood = await createCategory('Gỗ');
    await createCategory('Nhựa');
    const hidden = await post(`/${wood.id}/hide`);
    expect(hidden.body).toMatchObject({ data: { status: 'hidden' }, message: 'Đã ẩn danh mục.' });
    expect((await post(`/${wood.id}/hide`)).body.error.code).toBe('CATEGORY_ALREADY_HIDDEN');

    const publicList = await request(app).get('/api/v1/categories');
    expect(publicList.status).toBe(200);
    // Develop's public route: a raw JSON array.
    expect(publicList.body).toEqual([
      { id: expect.any(String), name: 'Nhựa', slug: 'nhua', parentId: null },
    ]);

    expect((await post(`/${wood.id}/show`)).body.data.status).toBe('active');
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
    const [item] = (await request(app).get('/api/v1/categories')).body;
    expect(Object.keys(item).sort()).toEqual(['id', 'name', 'parentId', 'slug']);
  });
});

describe('admin list', () => {
  it('paginates, filters and searches without accents, with toy counts', async () => {
    const remote = await createCategory('Xe điều khiển');
    const wood = await createCategory('Đồ gỗ');
    await post(`/${wood.id}/hide`);
    await createToy({ categoryId: remote.id, status: 'hidden' });
    await createToy({ categoryId: remote.id });

    const all = await get();
    expect(all.body.pagination).toMatchObject({ page: 1, limit: 100, totalItems: 2 });
    expect(all.body.data[0]).toMatchObject({ id: remote.id, toyCount: 2, canDelete: false });

    expect((await get('?q=dieu khien')).body.data).toHaveLength(1);
    expect((await get('?status=hidden')).body.data[0].id).toBe(wood.id);
    const paged = await get('?limit=1&page=2');
    expect(paged.body.data[0].id).toBe(wood.id);
  });
});

describe('delete', () => {
  it('deletes an unused category and refuses one used by any toy', async () => {
    const unused = await createCategory('Trống');
    const used = await createCategory('Đang dùng');
    await createToy({ categoryId: used.id, status: 'hidden' });

    const deleted = await del(`/${unused.id}`);
    expect(deleted.body).toEqual({ success: true, data: null, message: 'Đã xoá danh mục.' });
    const refused = await del(`/${used.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: 'CATEGORY_IN_USE', details: { toyCount: 1 } });
    expect(await AuditLogModel.countDocuments({ action: 'category.delete' })).toBe(1);
  });

  it('never deletes a category while a toy transaction that touched it is saving a toy', async () => {
    const category = await createCategory('Tranh chấp');
    const session = await mongoose.startSession();
    session.startTransaction();
    // What the toys feature does when it saves a toy (see the feature README).
    await CategoryModel.findOneAndUpdate(
      { _id: category.id, status: 'active' },
      { $inc: { __v: 1 } },
      { session },
    );
    const toy = (await createToy({ categoryId: category.id })).toObject();
    await ToyModel.deleteOne({ _id: toy._id });
    await ToyModel.create([{ ...toy, _id: newId() }], { session });

    const pending = del(`/${category.id}`).then((response) => response);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await session.commitTransaction();
    await session.endSession();

    const response = await pending;
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CATEGORY_IN_USE');
    expect(await CategoryModel.exists({ _id: category.id })).not.toBeNull();
  });
});

describe('reorder', () => {
  it('numbers the given ids first and keeps the others after them', async () => {
    const a = await createCategory('A gỗ');
    const b = await createCategory('B nhựa');
    const c = await createCategory('C vải');
    const response = await patch('/reorder', { ids: [c.id, a.id] });
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
    expect(audit?.target_type).toBe('CATEGORY');
    expect(audit?.target_id).toBeUndefined();
  });

  it('rejects duplicate ids', async () => {
    const a = await createCategory('Một');
    expect((await patch('/reorder', { ids: [a.id, a.id.toUpperCase()] })).status).toBe(400);
  });
});

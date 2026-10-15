import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createToyListingDependencies } from '../../src/app/toy-listing-dependencies.js';
import { AuditLogModel } from '../../src/features/audit_logs/audit_logs.model.js';
import { CategoryModel } from '../../src/features/categories/categories.model.js';
import { adminCategoriesRouter } from '../../src/features/categories/index.js';
import { ToyModel } from '../../src/features/toys/toys.model.js';
import type { ToyImageStorage } from '../../src/infrastructure/cloudinary/cloudinary-image-storage.js';
import { errorHandler } from '../../src/shared/middleware/error-handler.js';
import { newId, openTransaction, startRequest, useTestDatabase } from '../database/helpers.js';

// The real toy service, ports and routers on the test database; only the image storage is fake.

useTestDatabase();

const ADMIN_ID = newId().toString();
const OWNER_ID = newId().toString();
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

// Runs once during the next upload: after the category check, before the toy is saved.
let duringUpload: (() => Promise<void>) | undefined;
const deletedImages: string[] = [];
let uploads = 0;
const imageStorage: ToyImageStorage = {
  async upload() {
    const hook = duringUpload;
    duringUpload = undefined;
    if (hook) await hook();
    uploads += 1;
    return { url: `https://cdn.test/${uploads}.jpg`, publicId: `toyflow/toys/${uploads}` };
  },
  async delete(publicIds) {
    deletedImages.push(...publicIds);
  },
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = req.header('x-test-user');
  if (userId) req.auth = { userId, role: userId === ADMIN_ID ? 'ADMIN' : 'USER' };
  next();
});
app.use('/api/v1/toys', createToyListingDependencies({ imageStorage }).router);
app.use('/api/v1/admin/categories', adminCategoriesRouter);
app.use(errorHandler);

const createCategory = async (name: string, status: 'ACTIVE' | 'HIDDEN' = 'ACTIVE') =>
  String((await CategoryModel.create({ name, slug: newId().toString(), status }))._id);

const postToy = (categoryId: string) =>
  request(app)
    .post('/api/v1/toys')
    .set('x-test-user', OWNER_ID)
    .field('title', 'Tàu gỗ')
    .field('description', 'Bộ tàu gỗ 20 chi tiết')
    .field('condition', 'good')
    .field('categoryId', categoryId)
    .field('listingType', 'rent')
    .field('priceOrRate', '20000')
    .field('depositPrice', '300000')
    .field('ageRange', JSON.stringify({ minAge: 3, maxAge: 8 }))
    .attach('images', JPEG, { filename: 'toy.jpg', contentType: 'image/jpeg' });

const patchToy = (toyId: string, body: object) =>
  request(app).patch(`/api/v1/toys/${toyId}`).set('x-test-user', OWNER_ID).send(body);

const deleteCategory = (id: string) =>
  request(app).delete(`/api/v1/admin/categories/${id}`).set('x-test-user', ADMIN_ID);

beforeEach(async () => {
  duringUpload = undefined;
  deletedImages.length = 0;
  const verifications = mongoose.connection.collection('identity_verifications');
  await Promise.all([
    CategoryModel.deleteMany({}),
    ToyModel.deleteMany({}),
    AuditLogModel.collection.deleteMany({}),
    verifications.deleteMany({}),
  ]);
  await verifications.insertOne({
    userId: new mongoose.Types.ObjectId(OWNER_ID),
    status: 'VERIFIED',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toy create and update with categories', () => {
  it('creates a toy in an ACTIVE category and touches the category', async () => {
    const categoryId = await createCategory('Đồ chơi gỗ');
    const response = await postToy(categoryId);
    expect(response.status).toBe(201);
    expect(response.body.categoryId).toBe(categoryId);
    expect(response.body.categoryName).toBe('Đồ chơi gỗ');
    expect((await CategoryModel.findById(categoryId).lean())?.__v).toBe(1);
  });

  it('refuses a HIDDEN category on create and saves nothing', async () => {
    const hidden = await createCategory('Đã ẩn', 'HIDDEN');
    const response = await postToy(hidden);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect(await ToyModel.countDocuments()).toBe(0);
  });

  it('accepts an edit that keeps a category the Admin hid after the toy was posted', async () => {
    const categoryId = await createCategory('Sẽ ẩn');
    const toy = (await postToy(categoryId)).body as { id: string };
    await CategoryModel.updateOne({ _id: categoryId }, { status: 'HIDDEN' });

    // The edit form sends the unchanged categoryId with the other fields.
    const response = await patchToy(toy.id, { title: 'Tàu gỗ (mới)', categoryId });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      title: 'Tàu gỗ (mới)',
      categoryId,
      categoryName: 'Sẽ ẩn',
    });

    // The same id in upper case is still "unchanged".
    const upper = await patchToy(toy.id, { categoryId: categoryId.toUpperCase() });
    expect(upper.status).toBe(200);
    expect(upper.body.categoryId).toBe(categoryId);
  });

  it('refuses moving a toy to a HIDDEN category and accepts an ACTIVE one', async () => {
    const toy = (await postToy(await createCategory('Ban đầu'))).body as { id: string };
    const hidden = await createCategory('Ẩn', 'HIDDEN');
    const refused = await patchToy(toy.id, { categoryId: hidden });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('CATEGORY_NOT_FOUND');

    const active = await createCategory('Khác');
    const moved = await patchToy(toy.id, { categoryId: active });
    expect(moved.status).toBe(200);
    expect(moved.body.categoryId).toBe(active);
    expect(moved.body.categoryName).toBe('Khác');
    expect((await CategoryModel.findById(active).lean())?.__v).toBe(1);
  });
});

describe('toy listings and admin accounts', () => {
  it('refuses an Admin account creating a listing with 403 FORBIDDEN', async () => {
    const categoryId = await createCategory('Admin không đăng');
    const response = await postToy(categoryId).set('x-test-user', ADMIN_ID);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await ToyModel.countDocuments()).toBe(0);
  });
});

describe('category hide/delete racing a toy save', () => {
  it('refuses the toy when the category is hidden between the check and the save', async () => {
    const categoryId = await createCategory('Bị ẩn giữa chừng');
    duringUpload = async () => {
      await CategoryModel.updateOne({ _id: categoryId }, { status: 'HIDDEN' });
    };
    const response = await postToy(categoryId);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect(await ToyModel.countDocuments()).toBe(0);
    expect(deletedImages).toHaveLength(1);
  });

  it('never leaves a toy on a category deleted between the check and the save', async () => {
    const categoryId = await createCategory('Bị xoá giữa chừng');
    duringUpload = async () => {
      expect((await deleteCategory(categoryId)).status).toBe(200);
    };
    const response = await postToy(categoryId);
    expect(response.status).toBe(400);
    expect(await ToyModel.countDocuments()).toBe(0);
  });

  it('conflicts with an uncommitted hide, is retried after the commit and then refused', async () => {
    const categoryId = await createCategory('Đang ẩn');
    const hide = await openTransaction((session) =>
      CategoryModel.updateOne({ _id: categoryId }, { status: 'HIDDEN' }, { session }),
    );
    // Sync point: the first touch of the toy transaction hits the uncommitted hide (write
    // conflict); only then is the hide committed, and withTransaction retries the toy save.
    const touch = CategoryModel.findOneAndUpdate.bind(CategoryModel) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    let conflicts = 0;
    const spy = vi.spyOn(CategoryModel, 'findOneAndUpdate').mockImplementation((async (
      ...args: unknown[]
    ) => {
      try {
        return await touch(...args);
      } catch (error) {
        conflicts += 1;
        if (conflicts === 1) await hide.commit();
        throw error;
      }
    }) as never);

    const response = await postToy(categoryId);
    expect(conflicts).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect(await ToyModel.countDocuments()).toBe(0);
  });

  it('rejects a hide or delete that runs while the toy transaction holds the category', async () => {
    const categoryId = await createCategory('Đang được giữ');
    const touch = CategoryModel.findOneAndUpdate.bind(CategoryModel) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    let hideError: unknown;
    let pendingDelete: Promise<request.Response> | undefined;
    // Sync point: right after the toy transaction touched (write-locked) the category and before
    // it commits, a concurrent hide transaction and an Admin delete start.
    vi.spyOn(CategoryModel, 'findOneAndUpdate').mockImplementationOnce((async (
      ...args: unknown[]
    ) => {
      const held = await touch(...args);
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        await CategoryModel.updateOne({ _id: categoryId }, { status: 'HIDDEN' }, { session });
      } catch (error) {
        hideError = error;
      } finally {
        await session.abortTransaction();
        await session.endSession();
      }
      pendingDelete = startRequest(deleteCategory(categoryId));
      return held;
    }) as never);

    const created = await postToy(categoryId);
    expect(created.status).toBe(201);
    expect(String((hideError as { codeName?: string })?.codeName)).toBe('WriteConflict');
    const deleted = await pendingDelete;
    expect(deleted?.status).toBe(409);
    expect(deleted?.body.error.code).toBe('CATEGORY_IN_USE');
    const category = await CategoryModel.findById(categoryId).lean();
    expect(category?.status).toBe('ACTIVE');
    expect(await ToyModel.countDocuments({ categoryId })).toBe(1);
  });

  it('either the delete sees the toy or the toy sees the category gone, when both run at once', async () => {
    const categoryId = await createCategory('Tranh chấp');
    const [created, deleted] = await Promise.all([postToy(categoryId), deleteCategory(categoryId)]);

    const categoryLeft = await CategoryModel.exists({ _id: categoryId });
    const toys = await ToyModel.countDocuments({ categoryId });
    if (created.status === 201) {
      expect(deleted.status).toBe(409);
      expect(deleted.body.error.code).toBe('CATEGORY_IN_USE');
      expect(categoryLeft).not.toBeNull();
      expect(toys).toBe(1);
    } else {
      expect(created.status).toBe(400);
      expect(deleted.status).toBe(200);
      expect(categoryLeft).toBeNull();
      expect(toys).toBe(0);
    }
  });
});

import jwt from 'jsonwebtoken';
import mongoose, { type ClientSession } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import type { ToyImageStorage } from '../../src/interfaces/toy-listing.ports.js';
import { AuditLog as AuditLogModel } from '../../src/models/audit-log.model.js';
import { Category as CategoryModel } from '../../src/models/category.model.js';
import { IdentityVerification } from '../../src/models/identity-verification.model.js';
import { Toy as ToyModel } from '../../src/models/toy.model.js';
import { newId, useTestDatabase } from '../support/test-database.js';

// The real container, toy service, ports and routers on the test database, behind develop's JWT
// `authenticate`; only the image storage is fake.

useTestDatabase();

const ADMIN_ID = newId().toString();
const OWNER_ID = newId().toString();
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const bearer = (userId: string, role: 'USER' | 'ADMIN') =>
  `Bearer ${jwt.sign({ userId, role }, env.jwtAccessSecret, { expiresIn: '1h' })}`;
const OWNER = bearer(OWNER_ID, 'USER');
const ADMIN = bearer(ADMIN_ID, 'ADMIN');

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

const app = createApp({ toyImageStorage: imageStorage });

const createCategory = async (name: string, status = 'active') =>
  String((await CategoryModel.create({ name, slug: newId().toString(), status }))._id);

const postToy = (categoryId: string) =>
  request(app)
    .post('/api/v1/toys')
    .set('Authorization', OWNER)
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
  request(app).patch(`/api/v1/toys/${toyId}`).set('Authorization', OWNER).send(body);

const deleteCategory = (id: string) =>
  request(app).delete(`/api/v1/admin/categories/${id}`).set('Authorization', ADMIN);

// Sessions of openTransaction; afterEach aborts one a failed test left open, otherwise its write
// would block the next test's cleanup until the transaction times out.
const openSessions: ClientSession[] = [];

/**
 * Runs `work` in a transaction that stays open until `commit()` is called: lets a test hold a
 * write while another request runs, to check that the two write-conflict.
 */
const openTransaction = async (work: (session: ClientSession) => Promise<unknown>) => {
  const session = await mongoose.startSession();
  openSessions.push(session);
  session.startTransaction();
  await work(session);
  return { commit: () => session.commitTransaction() };
};

/** Starts a supertest request now (supertest is lazy) and resolves with its response. */
const startRequest = <T>(test: PromiseLike<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    test.then(resolve, reject);
  });

beforeEach(async () => {
  duringUpload = undefined;
  deletedImages.length = 0;
  await Promise.all([
    CategoryModel.deleteMany({}),
    ToyModel.deleteMany({}),
    AuditLogModel.collection.deleteMany({}),
    IdentityVerification.collection.deleteMany({}),
  ]);
  await IdentityVerification.collection.insertOne({
    userId: new mongoose.Types.ObjectId(OWNER_ID),
    status: 'verified',
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const session of openSessions.splice(0)) {
    if (session.inTransaction()) await session.abortTransaction();
    await session.endSession();
  }
});

describe('toy create and update with categories', () => {
  it('creates a toy in an ACTIVE category and touches the category', async () => {
    const categoryId = await createCategory('Đồ chơi gỗ');
    const response = await postToy(categoryId);
    expect(response.status).toBe(201);
    expect(response.body.categoryId).toBe(categoryId);
    expect(response.body.categoryName).toBe('Đồ chơi gỗ');
    const category = await CategoryModel.findById(categoryId).lean();
    expect(category?.__v).toBe(1);
  });

  it('accepts a category whose status older data stores in upper case', async () => {
    const categoryId = await createCategory('Dữ liệu cũ', 'ACTIVE');
    const response = await postToy(categoryId);
    expect(response.status).toBe(201);
    expect(response.body.categoryName).toBe('Dữ liệu cũ');
  });

  it('refuses a HIDDEN category on create and saves nothing', async () => {
    const hidden = await createCategory('Đã ẩn', 'hidden');
    const response = await postToy(hidden);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect(await ToyModel.countDocuments()).toBe(0);
  });

  it('accepts an edit that keeps a category the Admin hid after the toy was posted', async () => {
    const categoryId = await createCategory('Sẽ ẩn');
    const toy = (await postToy(categoryId)).body as { id: string };
    await CategoryModel.updateOne({ _id: categoryId }, { status: 'hidden' });

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
    const hidden = await createCategory('Ẩn', 'hidden');
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

  it('shows the category name on my listings, also for a hidden or deleted category', async () => {
    const hidden = await createCategory('Bị ẩn sau');
    const gone = await createCategory('Không còn');
    expect((await postToy(hidden)).status).toBe(201);
    expect((await postToy(gone)).status).toBe(201);
    await CategoryModel.updateOne({ _id: hidden }, { status: 'hidden' });
    // Only older data can point at a missing category: delete refuses a category in use.
    await CategoryModel.deleteOne({ _id: gone });

    const mine = await request(app).get('/api/v1/toys/mine').set('Authorization', OWNER);
    expect(mine.status).toBe(200);
    const names = Object.fromEntries(
      mine.body.items.map((item: { categoryId: string; categoryName: string }) => [
        item.categoryId,
        item.categoryName,
      ]),
    );
    expect(names).toEqual({ [hidden]: 'Bị ẩn sau', [gone]: '' });
  });
});

describe('toy listings and admin accounts', () => {
  it('refuses an Admin account creating a listing with 403 FORBIDDEN', async () => {
    const categoryId = await createCategory('Admin không đăng');
    const response = await postToy(categoryId).set('Authorization', ADMIN);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await ToyModel.countDocuments()).toBe(0);
  });
});

describe('category hide/delete racing a toy save', () => {
  it('refuses the toy when the category is hidden between the check and the save', async () => {
    const categoryId = await createCategory('Bị ẩn giữa chừng');
    duringUpload = async () => {
      await CategoryModel.updateOne({ _id: categoryId }, { status: 'hidden' });
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
      CategoryModel.updateOne({ _id: categoryId }, { status: 'hidden' }, { session }),
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
        await CategoryModel.updateOne({ _id: categoryId }, { status: 'hidden' }, { session });
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
    expect(category?.status).toBe('active');
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

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
import { categoriesRepository } from '../../src/repositories/category-admin.repository.js';
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

// POST /donation-posts saves a 'donate' toy under the same category rules.
const postDonation = (categoryId: string) =>
  request(app)
    .post('/api/v1/donation-posts')
    .set('Authorization', OWNER)
    .field('title', 'Gấu bông')
    .field('description', 'Gấu bông còn mới, đã giặt sạch')
    .field('condition', 'like_new')
    .field('categoryId', categoryId)
    .field('ageRange', JSON.stringify({ minAge: 1, maxAge: 5 }))
    .attach('images', JPEG, { filename: 'gau.jpg', contentType: 'image/jpeg' });

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

/**
 * Makes the next commit fail once, like a commit right after a failover (NoSuchTransaction,
 * labelled TransientTransactionError): the driver's withTransaction then runs the whole callback
 * again. Returns the spy, which counts the commits.
 */
const failNextCommitOnce = () => {
  const { prototype } = mongoose.mongo.ClientSession;
  const commit = prototype.commitTransaction;
  let failed = false;
  return vi.spyOn(prototype, 'commitTransaction').mockImplementation(async function (
    this: mongoose.mongo.ClientSession,
    ...args: Parameters<typeof commit>
  ) {
    if (failed) return commit.apply(this, args);
    failed = true;
    await this.abortTransaction();
    const error = new mongoose.mongo.MongoServerError({
      message: 'Transaction has been aborted.',
      code: 251,
      codeName: 'NoSuchTransaction',
    });
    error.addErrorLabel('TransientTransactionError');
    throw error;
  });
};

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

describe('a commit that fails once with a transient error', () => {
  // withTransaction runs the save callback again, so the toy write must be rebuilt on every run.
  it('still creates the toy', async () => {
    const categoryId = await createCategory('Lỗi lúc commit');
    const commits = failNextCommitOnce();

    const response = await postToy(categoryId);
    expect(commits).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(201);
    const stored = await ToyModel.find({}).lean();
    expect(stored.map((toy) => String(toy._id))).toEqual([response.body.id]);
    expect(stored[0]?.title).toBe('Tàu gỗ');
    expect(stored[0]?.images.map((image) => image.publicId)).toEqual(
      response.body.images.map((image: { publicId: string }) => image.publicId),
    );
    expect(stored[0]?.images).toHaveLength(1);
    expect(deletedImages).toEqual([]);
    // Only the touch of the second run was committed.
    expect((await CategoryModel.findById(categoryId).lean())?.__v).toBe(1);
  });

  it('stores an edit that changes the category and deletes only the image it removed', async () => {
    const from = await createCategory('Danh mục cũ');
    const to = await createCategory('Danh mục mới');
    const toy = (await postToy(from)).body as { id: string; images: { publicId: string }[] };
    const removed = toy.images[0]?.publicId;
    const commits = failNextCommitOnce();

    const response = await request(app)
      .patch(`/api/v1/toys/${toy.id}`)
      .set('Authorization', OWNER)
      .field('title', 'Tàu gỗ (đổi danh mục)')
      .field('categoryId', to)
      .field('removeImagePublicIds', JSON.stringify([removed]))
      .attach('images', JPEG, { filename: 'new.jpg', contentType: 'image/jpeg' });

    expect(commits).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      title: 'Tàu gỗ (đổi danh mục)',
      categoryId: to,
      categoryName: 'Danh mục mới',
    });
    const stored = await ToyModel.findById(toy.id).lean();
    expect(stored?.title).toBe('Tàu gỗ (đổi danh mục)');
    expect(String(stored?.categoryId)).toBe(to);
    const storedImages = stored?.images.map((image) => image.publicId);
    expect(storedImages).toEqual(
      response.body.images.map((image: { publicId: string }) => image.publicId),
    );
    expect(storedImages).not.toContain(removed);
    // The image the edit removed is deleted; the new upload, which the toy now uses, is kept.
    expect(deletedImages).toEqual([removed]);
  });

  it('still creates a donation post', async () => {
    const categoryId = await createCategory('Quyên góp lúc lỗi commit');
    const commits = failNextCommitOnce();

    const response = await postDonation(categoryId);
    expect(commits).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(201);
    const stored = await ToyModel.find({}).lean();
    expect(stored.map((toy) => String(toy._id))).toEqual([response.body.data.id]);
    expect(stored[0]?.listingType).toBe('donate');
    expect(deletedImages).toEqual([]);
  });
});

describe('another edit of the same toy saved during the upload', () => {
  // The other edit (a second tab) replaced the image and bumped __v, as every images change does,
  // while this PATCH uploaded its new image. This PATCH's images come from the toy before that.
  const replaceImagesDuringUpload = (toyId: string) => {
    duringUpload = async () => {
      await ToyModel.updateOne(
        { _id: toyId },
        {
          $set: { images: [{ url: 'https://cdn.test/other.jpg', publicId: 'other/2' }] },
          $inc: { __v: 1 },
        },
      );
    };
  };

  it('refuses an edit that changes the category with 409 LISTING_CHANGED', async () => {
    const from = await createCategory('Trước khi sửa');
    const to = await createCategory('Sau khi sửa');
    const toy = (await postToy(from)).body as { id: string };
    replaceImagesDuringUpload(toy.id);

    const response = await request(app)
      .patch(`/api/v1/toys/${toy.id}`)
      .set('Authorization', OWNER)
      .field('title', 'Tàu gỗ (mới)')
      .field('categoryId', to)
      .attach('images', JPEG, { filename: 'new.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LISTING_CHANGED');
    // The other edit is kept; this one, category touch included, is not stored.
    const stored = await ToyModel.findById(toy.id).lean();
    expect(stored?.title).toBe('Tàu gỗ');
    expect(String(stored?.categoryId)).toBe(from);
    expect(stored?.images.map((image) => image.publicId)).toEqual(['other/2']);
    expect((await CategoryModel.findById(to).lean())?.__v).toBe(0);
    // Only this edit's own upload is deleted.
    expect(deletedImages).toEqual([`toyflow/toys/${uploads}`]);
  });

  it('refuses an edit that keeps the category with the same 409', async () => {
    const categoryId = await createCategory('Giữ danh mục');
    const toy = (await postToy(categoryId)).body as { id: string };
    replaceImagesDuringUpload(toy.id);

    const response = await request(app)
      .patch(`/api/v1/toys/${toy.id}`)
      .set('Authorization', OWNER)
      .field('title', 'Tàu gỗ (mới)')
      .attach('images', JPEG, { filename: 'new.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LISTING_CHANGED');
    const stored = await ToyModel.findById(toy.id).lean();
    expect(stored?.title).toBe('Tàu gỗ');
    expect(stored?.images.map((image) => image.publicId)).toEqual(['other/2']);
    expect(deletedImages).toEqual([`toyflow/toys/${uploads}`]);
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

describe('an edit sends the listing back to the Admin review (GB-08)', () => {
  const reviewer = newId();
  const reviewedAt = new Date('2026-11-01T08:00:00Z');

  it('stores pending and a new submission time, with and without a category change', async () => {
    const from = await createCategory('Duyệt rồi');
    const to = await createCategory('Danh mục khác');
    const created = await postToy(from);
    expect(created.status).toBe(201);
    const toyId = created.body.id as string;
    const stored = await ToyModel.findById(toyId).lean();
    expect(stored?.moderation?.submittedAt).toBeInstanceOf(Date);

    for (const body of [{ title: 'Tàu gỗ (sửa)' }, { categoryId: to }]) {
      await ToyModel.updateOne(
        { _id: toyId },
        {
          status: 'active',
          'moderation.submittedAt': new Date(0),
          'moderation.reviewedBy': reviewer,
          'moderation.reviewedAt': reviewedAt,
        },
      );
      const response = await patchToy(toyId, body);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('pending');
      const edited = await ToyModel.findById(toyId).lean();
      expect(edited?.status).toBe('pending');
      expect(edited?.moderation?.submittedAt?.getTime()).toBeGreaterThan(0);
      expect(String(edited?.moderation?.reviewedBy)).toBe(String(reviewer));
    }
  });

  it('clears the rejection of a rejected listing sent again', async () => {
    const toyId = (await postToy(await createCategory('Bị từ chối'))).body.id as string;
    await ToyModel.updateOne(
      { _id: toyId },
      {
        status: 'hidden',
        'moderation.reviewedBy': reviewer,
        'moderation.reviewedAt': reviewedAt,
        'moderation.rejectReason': 'Ảnh bị mờ',
      },
    );

    const response = await patchToy(toyId, { title: 'Tàu gỗ (ảnh mới)' });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('pending');
    const edited = await ToyModel.findById(toyId).lean();
    expect(edited?.moderation?.rejectReason).toBeUndefined();
    expect(edited?.moderation?.reviewedBy).toBeUndefined();
    expect(edited?.moderation?.reviewedAt).toBeUndefined();
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
    expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect(await ToyModel.countDocuments()).toBe(0);
    expect(deletedImages).toHaveLength(1);
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
    // The errors of the delete's lockForDelete tries; the first one releases the toy transaction.
    const lockForDelete = categoriesRepository.lockForDelete;
    const deleteErrors: string[] = [];
    let releaseToy = () => {};
    const deleteHitTheToy = new Promise<void>((resolve) => {
      releaseToy = resolve;
    });
    vi.spyOn(categoriesRepository, 'lockForDelete').mockImplementation(async (id, session) => {
      try {
        return await lockForDelete(id, session);
      } catch (error) {
        deleteErrors.push(String((error as { codeName?: string }).codeName));
        releaseToy();
        throw error;
      }
    });
    let hideError: unknown;
    let pendingDelete: Promise<request.Response> | undefined;
    // Sync point: the toy transaction has touched the category and is about to insert the toy. A
    // hide transaction and an Admin delete start now, and the toy transaction stays open until
    // the delete has run into it. Should the delete finish without a conflict, the toy goes on
    // and the asserts below fail instead of the test hanging.
    const toyPrototype = ToyModel.prototype as { save: (...args: unknown[]) => Promise<unknown> };
    const save = toyPrototype.save;
    vi.spyOn(toyPrototype, 'save').mockImplementationOnce(async function (
      this: unknown,
      ...args: unknown[]
    ) {
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
      await Promise.race([deleteHitTheToy, pendingDelete]);
      return save.apply(this, args);
    });

    const created = await postToy(categoryId);
    expect(created.status).toBe(201);
    expect(String((hideError as { codeName?: string })?.codeName)).toBe('WriteConflict');
    const deleted = await pendingDelete;
    // The delete ran into the open toy transaction, was retried after its commit and saw the toy.
    expect(deleteErrors[0]).toBe('WriteConflict');
    expect(deleted?.status).toBe(409);
    expect(deleted?.body.error.code).toBe('CATEGORY_IN_USE');
    const category = await CategoryModel.findById(categoryId).lean();
    expect(category?.status).toBe('active');
    expect(await ToyModel.countDocuments({ categoryId })).toBe(1);
  });

  it('touches the category of a donation post', async () => {
    const categoryId = await createCategory('Gấu bông');
    const response = await postDonation(categoryId);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ listingType: 'donate', categoryId });
    expect((await CategoryModel.findById(categoryId).lean())?.__v).toBe(1);
  });

  it('refuses a donation post whose category is hidden during the upload', async () => {
    const categoryId = await createCategory('Ẩn khi đang tải ảnh');
    duringUpload = async () => {
      await CategoryModel.updateOne({ _id: categoryId }, { status: 'hidden' });
    };
    const response = await postDonation(categoryId);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect(await ToyModel.countDocuments()).toBe(0);
    expect(deletedImages).toHaveLength(1);
  });

  it('never leaves a donation post on a category deleted during the upload', async () => {
    const categoryId = await createCategory('Xoá khi đang tải ảnh');
    duringUpload = async () => {
      expect((await deleteCategory(categoryId)).status).toBe(200);
    };
    const response = await postDonation(categoryId);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect(await ToyModel.countDocuments()).toBe(0);
    expect(deletedImages).toHaveLength(1);
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

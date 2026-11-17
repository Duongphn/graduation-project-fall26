import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose, { type ClientSession, type Model } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { env } from '../src/config/env.js';
import type { RequestActor } from '../src/types/request-actor.js';
import type { IToy } from '../src/models/toy.model.js';
import type { ToyListingDto, ToyListingPorts } from '../src/interfaces/toy-listing.ports.js';
import { ToyListingService } from '../src/services/toy-listing.service.js';
import { createToyListingRouter } from '../src/routes/toy-listing.routes.js';
import type { ToyImageStorage } from '../src/interfaces/toy-listing.ports.js';
import { errorHandler } from '../src/middlewares/error-handler.js';

const CATEGORY_ID = '64b000000000000000000001';
const CATEGORY_NAME = 'Đồ chơi STEM';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const NOT_AN_IMAGE = Buffer.from('this is definitely not an image');

interface FakeToy {
  _id: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  condition: string;
  listingType: 'rent' | 'sell';
  priceOrRate: number;
  depositPrice?: number;
  status: 'pending' | 'active' | 'hidden';
  moderation?: {
    submittedAt?: Date;
    reviewedBy?: mongoose.Types.ObjectId;
    reviewedAt?: Date;
    rejectReason?: string;
  };
  ageRange: { minAge: number; maxAge: number };
  images: { url: string; publicId: string }[];
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
  save(): Promise<FakeToy>;
}

interface FakeToyModel {
  new (data: Record<string, unknown>): FakeToy;
  find(filter: { ownerId?: { toString(): string } }): {
    sort(spec: Record<string, number>): FakeToy[];
  };
  findById(id: string): Promise<FakeToy | null>;
  findByIdAndDelete(id: string): Promise<FakeToy | null>;
}

function createInMemoryToyModel(): { model: Model<IToy>; store: FakeToy[] } {
  const store: FakeToy[] = [];

  const ToyModel = function (this: FakeToy, data: Record<string, unknown>): void {
    Object.assign(this, data);
    this._id = new mongoose.Types.ObjectId();
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.save = async (): Promise<FakeToy> => {
      this.updatedAt = new Date();
      const index = store.findIndex((doc) => doc._id.equals(this._id));
      if (index >= 0) {
        store[index] = this;
      } else {
        store.push(this);
      }
      return this;
    };
  } as unknown as FakeToyModel;

  ToyModel.find = (filter) => {
    const ownerId = filter.ownerId?.toString();
    const items = store.filter(
      (doc) => ownerId === undefined || doc.ownerId.toString() === ownerId,
    );
    return {
      sort: (): FakeToy[] =>
        items.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    };
  };

  ToyModel.findById = async (id) => store.find((doc) => doc._id.toString() === id) ?? null;

  ToyModel.findByIdAndDelete = async (id) => {
    const index = store.findIndex((doc) => doc._id.toString() === id);
    if (index < 0) {
      return null;
    }
    return store.splice(index, 1)[0] ?? null;
  };

  return { model: ToyModel as unknown as Model<IToy>, store };
}

interface PortOptions {
  verified?: boolean;
  categoryExists?: boolean;
  unfinishedOrder?: boolean;
  soldIds?: string[];
}

interface PortState {
  verified: boolean;
  categoryExists: boolean;
  unfinishedOrder: boolean;
  soldIds: Set<string>;
  /** Makes getSoldToyIds fail, like a database error after the toy was saved. */
  soldLookupFails?: boolean;
}

function createPorts(options: PortOptions = {}): { ports: ToyListingPorts; state: PortState } {
  const state: PortState = {
    verified: options.verified ?? true,
    categoryExists: options.categoryExists ?? true,
    unfinishedOrder: options.unfinishedOrder ?? false,
    soldIds: new Set<string>(options.soldIds ?? []),
  };

  const ports: ToyListingPorts = {
    isVerifiedUser: async () => state.verified,
    categoryExists: async () => state.categoryExists,
    saveWithActiveCategory: async (_categoryId, save) =>
      state.categoryExists
        ? { result: await save({} as ClientSession), categoryName: CATEGORY_NAME }
        : null,
    hasUnfinishedOrder: async () => state.unfinishedOrder,
    getSoldToyIds: async (toyIds) => {
      if (state.soldLookupFails) throw new Error('Lookup of completed orders failed.');
      return new Set(toyIds.filter((id) => state.soldIds.has(id)));
    },
    getCategoryNames: async (categoryIds) =>
      new Map(
        categoryIds.filter((id) => id === CATEGORY_ID).map((id) => [id, CATEGORY_NAME] as const),
      ),
  };

  return { ports, state };
}

function createImageStorage(): {
  storage: ToyImageStorage;
  deletions: string[][];
  uploads: string[];
} {
  const deletions: string[][] = [];
  const uploads: string[] = [];
  let counter = 0;

  const storage: ToyImageStorage = {
    async upload(_buffer, mimeType) {
      counter += 1;
      uploads.push(mimeType);
      return {
        url: `https://cdn.test/toy-${counter}`,
        publicId: `toyflow/toys/toy-${counter}`,
      };
    },
    async delete(publicIds) {
      deletions.push([...publicIds]);
    },
  };

  return { storage, deletions, uploads };
}

function setup(options: PortOptions = {}) {
  const { model, store } = createInMemoryToyModel();
  const { ports, state } = createPorts(options);
  const { storage, deletions, uploads } = createImageStorage();
  const service = new ToyListingService(ports, storage, model);

  let currentActor: RequestActor | undefined;

  const app = express();
  app.use(express.json());
  // Ký JWT thật cho actor hiện tại để request đi qua middleware authenticate của router
  app.use((req, _res, next) => {
    if (currentActor) {
      const token = jwt.sign(
        { userId: currentActor.userId, role: currentActor.actorType },
        env.jwtAccessSecret,
        { expiresIn: '1h' },
      );
      req.headers.authorization = `Bearer ${token}`;
    }
    next();
  });
  app.use('/api/v1/toys', createToyListingRouter(service));
  app.use(errorHandler);

  const actor1: RequestActor = {
    userId: new mongoose.Types.ObjectId().toString(),
    actorType: 'USER',
  };
  const actor2: RequestActor = {
    userId: new mongoose.Types.ObjectId().toString(),
    actorType: 'USER',
  };

  return {
    app,
    service,
    store,
    state,
    storage,
    deletions,
    uploads,
    actor1,
    actor2,
    setActor: (actor?: RequestActor): void => {
      currentActor = actor;
    },
  };
}

type Context = ReturnType<typeof setup>;

interface ImageInput {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const DEFAULT_IMAGE: ImageInput = {
  buffer: JPEG,
  contentType: 'image/jpeg',
  filename: 'toy.jpg',
};

const images = (count: number, image: ImageInput = DEFAULT_IMAGE): ImageInput[] =>
  Array.from({ length: count }, () => image);

// The fewest photos each listing type takes (GB-10): 3 for rent, 4 for sale.
const MIN_PHOTOS: Record<string, number> = { rent: 3, sell: 4 };

function postListing(
  ctx: Context,
  fields: Record<string, string>,
  files: ImageInput[] = images(MIN_PHOTOS[fields.listingType ?? 'rent'] ?? 3),
) {
  let req = request(ctx.app).post('/api/v1/toys');
  for (const [key, value] of Object.entries(fields)) {
    req = req.field(key, value);
  }
  for (const file of files) {
    req = req.attach('images', file.buffer, {
      filename: file.filename,
      contentType: file.contentType,
    });
  }
  return req;
}

function rentFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    title: 'Wooden Train',
    description: 'Barely used wooden train set with twelve carriages and a full oval track.',
    condition: 'good',
    categoryId: CATEGORY_ID,
    listingType: 'rent',
    priceOrRate: '20000',
    depositPrice: '300000',
    ageRange: JSON.stringify({ minAge: 3, maxAge: 8 }),
    ...overrides,
  };
}

function sellFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    title: 'LEGO Set',
    description: 'Complete LEGO set with every brick, the manual and the original box.',
    condition: 'new',
    categoryId: CATEGORY_ID,
    listingType: 'sell',
    priceOrRate: '250000',
    ageRange: JSON.stringify({ minAge: 6, maxAge: 12 }),
    ...overrides,
  };
}

async function createListing(
  ctx: Context,
  actor: RequestActor,
  fields: Record<string, string>,
): Promise<ToyListingDto> {
  ctx.setActor(actor);
  const res = await postListing(ctx, fields);
  expect(res.status).toBe(201);
  return res.body as ToyListingDto;
}

let ctx: Context;

beforeEach(() => {
  ctx = setup();
});

describe('POST /api/v1/toys', () => {
  it('returns 401 when there is no authenticated actor', async () => {
    ctx.setActor(undefined);
    const res = await postListing(ctx, rentFields());

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('creates a rental listing with 201 and pending status', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    expect(listing).toMatchObject({
      ownerId: ctx.actor1.userId,
      categoryId: CATEGORY_ID,
      categoryName: CATEGORY_NAME,
      title: 'Wooden Train',
      listingType: 'rent',
      priceOrRate: 20000,
      depositPrice: 300000,
      status: 'pending',
      quantity: 1,
      ageRange: { minAge: 3, maxAge: 8 },
    });
    expect(listing.images).toHaveLength(3);
    expect(ctx.uploads).toEqual(['image/jpeg', 'image/jpeg', 'image/jpeg']);
  });

  it('creates a sell listing without a deposit', async () => {
    const listing = await createListing(ctx, ctx.actor1, sellFields());

    expect(listing.listingType).toBe('sell');
    expect(listing.depositPrice).toBeUndefined();
  });

  it('accepts a PNG image', async () => {
    ctx.setActor(ctx.actor1);
    const res = await postListing(
      ctx,
      rentFields(),
      images(3, { buffer: PNG, contentType: 'image/png', filename: 'toy.png' }),
    );

    expect(res.status).toBe(201);
    expect(ctx.uploads).toEqual(['image/png', 'image/png', 'image/png']);
  });

  it('returns 403 when the actor is not verified', async () => {
    ctx.state.verified = false;
    ctx.setActor(ctx.actor1);
    const res = await postListing(ctx, rentFields());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('USER_NOT_VERIFIED');
  });

  it('returns 400 when the category does not exist', async () => {
    ctx.state.categoryExists = false;
    ctx.setActor(ctx.actor1);
    const res = await postListing(ctx, rentFields());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('returns 400 when no image is attached', async () => {
    ctx.setActor(ctx.actor1);
    const res = await postListing(ctx, rentFields(), []);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'TOO_FEW_PHOTOS',
      message: 'Please upload at least 3 photos.',
    });
  });

  it('takes 3 to 8 photos for a rental and 4 to 8 for a sale (GB-10)', async () => {
    ctx.setActor(ctx.actor1);
    const tooFewRent = await postListing(ctx, rentFields(), images(2));
    expect(tooFewRent.status).toBe(400);
    expect(tooFewRent.body.error).toMatchObject({
      code: 'TOO_FEW_PHOTOS',
      message: 'Please upload at least 3 photos.',
    });

    const tooFewSale = await postListing(ctx, sellFields(), images(3));
    expect(tooFewSale.status).toBe(400);
    expect(tooFewSale.body.error.message).toBe('Please upload at least 4 photos.');

    const tooMany = await postListing(ctx, rentFields(), images(9));
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error).toMatchObject({
      code: 'TOO_MANY_PHOTOS',
      message: 'Please upload no more than 8 photos.',
    });
    // Nothing is uploaded for a refused listing.
    expect(ctx.uploads).toHaveLength(0);

    expect((await postListing(ctx, rentFields(), images(8))).status).toBe(201);
    expect((await postListing(ctx, sellFields(), images(4))).status).toBe(201);
    expect((await postListing(ctx, sellFields(), images(8))).status).toBe(201);
  });

  it('refuses a WebP photo: listing photos are JPG or PNG (GB-10, MSG20)', async () => {
    const WEBP = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
    ]);
    ctx.setActor(ctx.actor1);
    const res = await postListing(ctx, rentFields(), [
      ...images(2),
      { buffer: WEBP, contentType: 'image/webp', filename: 'toy.webp' },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_IMAGE_FORMAT',
      message: 'Only JPG or PNG files up to 5 MB are accepted.',
    });
    expect(ctx.uploads).toHaveLength(0);
  });

  it('returns 400 for an image whose signature is invalid', async () => {
    ctx.setActor(ctx.actor1);
    const res = await postListing(ctx, rentFields(), [
      ...images(2),
      { buffer: NOT_AN_IMAGE, contentType: 'image/jpeg', filename: 'fake.jpg' },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE_FORMAT');
    expect(ctx.uploads).toHaveLength(0);
  });

  it('returns 400 when a sell listing supplies a deposit', async () => {
    ctx.setActor(ctx.actor1);
    const res = await postListing(ctx, sellFields({ depositPrice: '300000' }));

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('depositPrice is not allowed for sell listings.');
  });

  it('rejects client-supplied owner/status fields', async () => {
    ctx.setActor(ctx.actor1);
    const res = await postListing(ctx, rentFields({ ownerId: ctx.actor2.userId }));

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Field "ownerId" is not allowed in input.');
  });

  it('returns 400 when ageRange minAge is greater than maxAge', async () => {
    ctx.setActor(ctx.actor1);
    const res = await postListing(
      ctx,
      rentFields({ ageRange: JSON.stringify({ minAge: 10, maxAge: 5 }) }),
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('ageRange minAge must be less than or equal to maxAge.');
  });
});

describe('field rules of the listing screens (R03 III.3.1.1, III.3.1.2)', () => {
  const expectFieldError = (res: request.Response, field: string) => {
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { field } });
  };

  it('takes a title of up to 100 characters and a description of 50 to 1000', async () => {
    ctx.setActor(ctx.actor1);
    expectFieldError(await postListing(ctx, rentFields({ title: 'T'.repeat(101) })), 'title');
    expectFieldError(
      await postListing(ctx, rentFields({ description: 'D'.repeat(49) })),
      'description',
    );
    expectFieldError(
      await postListing(ctx, rentFields({ description: 'D'.repeat(1001) })),
      'description',
    );
    expect(ctx.uploads).toHaveLength(0);

    const longest = await postListing(
      ctx,
      rentFields({ title: 'T'.repeat(100), description: 'D'.repeat(1000) }),
    );
    expect(longest.status).toBe(201);
    expect(
      (await postListing(ctx, rentFields({ description: 'D'.repeat(50) }))).status,
    ).toBe(201);
  });

  it('takes 5.000 to 5.000.000 đ a day and a deposit of at least one day for a rental', async () => {
    ctx.setActor(ctx.actor1);
    expectFieldError(
      await postListing(ctx, rentFields({ priceOrRate: '4999', depositPrice: '300000' })),
      'priceOrRate',
    );
    expectFieldError(
      await postListing(ctx, rentFields({ priceOrRate: '5000001', depositPrice: '6000000' })),
      'priceOrRate',
    );
    expectFieldError(
      await postListing(ctx, rentFields({ priceOrRate: '20000.5' })),
      'priceOrRate',
    );
    expectFieldError(
      await postListing(ctx, rentFields({ priceOrRate: '20000', depositPrice: '19999' })),
      'depositPrice',
    );

    expect(
      (await postListing(ctx, rentFields({ priceOrRate: '5000', depositPrice: '5000' }))).status,
    ).toBe(201);
    expect(
      (await postListing(ctx, rentFields({ priceOrRate: '5000000', depositPrice: '5000000' })))
        .status,
    ).toBe(201);
  });

  it('takes 10.000 to 50.000.000 đ for a sale', async () => {
    ctx.setActor(ctx.actor1);
    expectFieldError(await postListing(ctx, sellFields({ priceOrRate: '9999' })), 'priceOrRate');
    expectFieldError(
      await postListing(ctx, sellFields({ priceOrRate: '50000001' })),
      'priceOrRate',
    );
    expect((await postListing(ctx, sellFields({ priceOrRate: '10000' }))).status).toBe(201);
    expect((await postListing(ctx, sellFields({ priceOrRate: '50000000' }))).status).toBe(201);
  });

  it('checks an edit against the same rules, with the stored price for the deposit', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.setActor(ctx.actor1);
    const patch = (body: object) => request(ctx.app).patch(`/api/v1/toys/${listing.id}`).send(body);
    expectFieldError(await patch({ description: 'Too short.' }), 'description');
    // The stored daily price is 20.000 đ.
    expectFieldError(await patch({ depositPrice: 10000 }), 'depositPrice');
    expectFieldError(await patch({ priceOrRate: 400000 }), 'depositPrice');
    expect((await patch({ priceOrRate: 300000 })).status).toBe(200);
    expect(ctx.store[0]?.priceOrRate).toBe(300000);
  });
});

describe('GET /api/v1/toys/mine', () => {
  it('returns 401 without an actor', async () => {
    ctx.setActor(undefined);
    const res = await request(ctx.app).get('/api/v1/toys/mine');

    expect(res.status).toBe(401);
  });

  it('returns only the actor listings', async () => {
    await createListing(ctx, ctx.actor1, rentFields());
    await createListing(ctx, ctx.actor1, sellFields());
    await createListing(ctx, ctx.actor2, rentFields());

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).get('/api/v1/toys/mine');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].categoryName).toBe(CATEGORY_NAME);
    expect(res.body.items.every((item: { ownerId: string }) => item.ownerId === ctx.actor1.userId)).toBe(
      true,
    );
  });

  it('paginates results', async () => {
    await createListing(ctx, ctx.actor1, rentFields({ title: 'One' }));
    await createListing(ctx, ctx.actor1, rentFields({ title: 'Two' }));
    await createListing(ctx, ctx.actor1, rentFields({ title: 'Three' }));

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).get('/api/v1/toys/mine?page=2&limit=1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, limit: 1, total: 3 });
    expect(res.body.items).toHaveLength(1);
  });

  it('derives a sold status from completed purchase orders', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    ctx.state.soldIds.add(listing.id);

    ctx.setActor(ctx.actor1);
    const all = await request(ctx.app).get('/api/v1/toys/mine');
    expect(all.body.items[0].status).toBe('sold');

    const soldOnly = await request(ctx.app).get('/api/v1/toys/mine?status=sold');
    expect(soldOnly.body.total).toBe(1);

    const pendingOnly = await request(ctx.app).get('/api/v1/toys/mine?status=pending');
    expect(pendingOnly.body.total).toBe(0);
  });

  it('returns 400 for an invalid status filter', async () => {
    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).get('/api/v1/toys/mine?status=deleted');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STATUS_FILTER');
  });

  it('returns 400 for an invalid page', async () => {
    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).get('/api/v1/toys/mine?page=0');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/v1/toys/:toyId', () => {
  it('updates editable fields on an owned listing', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ title: 'Updated Train', priceOrRate: 25000 });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Train');
    expect(res.body.categoryName).toBe(CATEGORY_NAME);
    expect(res.body.priceOrRate).toBe(25000);
    expect(res.body.status).toBe('pending');
  });

  it('returns 403 when editing another owner listing', async () => {
    const listing = await createListing(ctx, ctx.actor2, rentFields());

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ title: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for a malformed listing id', async () => {
    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).patch('/api/v1/toys/not-an-id').send({ title: 'Nope' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when an edit leaves fewer photos than the listing type needs', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ removeImagePublicIds: JSON.stringify([listing.images[0]?.publicId]) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'TOO_FEW_PHOTOS',
      message: 'Please upload at least 3 photos.',
    });
    expect(ctx.deletions).toEqual([]);
  });

  it('counts the photos of the new listing type when an edit changes it', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.setActor(ctx.actor1);
    const tooFew = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ listingType: 'sell', priceOrRate: 250000 });
    expect(tooFew.status).toBe(400);
    expect(tooFew.body.error.message).toBe('Please upload at least 4 photos.');

    const enough = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .field('listingType', 'sell')
      .field('priceOrRate', '250000')
      .attach('images', JPEG, { filename: 'fourth.jpg', contentType: 'image/jpeg' });
    expect(enough.status).toBe(200);
    expect(enough.body.images).toHaveLength(4);
  });

  it('replaces an image and deletes the removed asset', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    const oldPublicId = listing.images[0]?.publicId ?? '';

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .field('removeImagePublicIds', JSON.stringify([oldPublicId]))
      .attach('images', PNG, { filename: 'new.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(3);
    expect(res.body.images.map((image: { publicId: string }) => image.publicId)).not.toContain(
      oldPublicId,
    );
    expect(ctx.deletions).toContainEqual([oldPublicId]);
  });

  it('keeps the new image when a read after the saved edit fails', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.state.soldLookupFails = true;
    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .field('title', 'Saved Before The Read')
      .attach('images', PNG, { filename: 'new.png', contentType: 'image/png' });

    expect(res.status).toBe(500);
    const stored = ctx.store.find((toy) => toy._id.toString() === listing.id);
    expect(stored?.title).toBe('Saved Before The Read');
    expect(stored?.images).toHaveLength(4);
    // The stored toy uses the new upload, so it must not be deleted.
    expect(ctx.deletions).toEqual([]);
  });

  it('returns 409 and uploads nothing when an unfinished order exists', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    const uploadsBefore = ctx.uploads.length;

    ctx.state.unfinishedOrder = true;
    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .field('title', 'Blocked Edit')
      .attach('images', PNG, { filename: 'new.png', contentType: 'image/png' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_IN_PROGRESS');
    expect(ctx.uploads.length).toBe(uploadsBefore);
  });
});

describe('PATCH /api/v1/toys/:toyId and the Admin review (GB-08)', () => {
  const storedToy = (id: string): FakeToy => {
    const toy = ctx.store.find((doc) => doc._id.toString() === id);
    if (!toy) throw new Error(`toy ${id} not stored`);
    return toy;
  };
  const reviewedAt = new Date('2026-11-01T08:00:00Z');
  const reviewer = new mongoose.Types.ObjectId();

  it('stamps a new listing with its submission time for the Admin queue', async () => {
    const before = Date.now();
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    const submittedAt = storedToy(listing.id).moderation?.submittedAt;
    expect(submittedAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(listing.moderation?.submittedAt ?? 0).getTime()).toBe(submittedAt?.getTime());
  });

  it('sends an approved listing back to pending review and keeps its approval data', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    Object.assign(storedToy(listing.id), {
      status: 'active',
      moderation: { submittedAt: new Date(0), reviewedBy: reviewer, reviewedAt },
    });

    ctx.setActor(ctx.actor1);
    const before = Date.now();
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ title: 'Updated Train' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    const stored = storedToy(listing.id);
    expect(stored.status).toBe('pending');
    expect(stored.moderation?.submittedAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.moderation?.reviewedBy).toBe(reviewer);
    // The Owner never gets the reviewing Admin's id.
    expect(res.body.moderation).not.toHaveProperty('reviewedBy');
    expect(new Date(res.body.moderation.reviewedAt).getTime()).toBe(reviewedAt.getTime());
  });

  it('sends a rejected listing again as a new submission', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    Object.assign(storedToy(listing.id), {
      status: 'hidden',
      moderation: {
        submittedAt: new Date(0),
        reviewedBy: reviewer,
        reviewedAt,
        rejectReason: 'Ảnh bị mờ',
      },
    });

    ctx.setActor(ctx.actor1);
    const mine = await request(ctx.app).get('/api/v1/toys/mine');
    // The Owner reads the reason of the rejection (R03 III.3.2.1).
    expect(mine.body.items[0]).toMatchObject({
      status: 'hidden',
      moderation: { rejectReason: 'Ảnh bị mờ' },
    });
    expect(mine.body.items[0].moderation).not.toHaveProperty('reviewedBy');

    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ title: 'Clearer Photos' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.moderation).not.toHaveProperty('rejectReason');
    const stored = storedToy(listing.id);
    expect(stored.moderation?.rejectReason).toBeUndefined();
    expect(stored.moderation?.reviewedAt).toBeUndefined();
    expect(stored.moderation?.reviewedBy).toBeUndefined();
    expect(stored.moderation?.submittedAt?.getTime()).toBeGreaterThan(0);
  });

  it('keeps the queue place of a pending listing', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    const submittedAt = new Date('2026-11-10T00:00:00Z');
    storedToy(listing.id).moderation = { submittedAt };

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ title: 'Typo Fixed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(storedToy(listing.id).moderation?.submittedAt).toBe(submittedAt);
  });

  it('fixes the listing type once the Admin has approved the listing (GB-09)', async () => {
    const approved = await createListing(ctx, ctx.actor1, rentFields());
    Object.assign(storedToy(approved.id), {
      status: 'active',
      moderation: { reviewedBy: reviewer, reviewedAt },
    });
    ctx.setActor(ctx.actor1);
    const refused = await request(ctx.app)
      .patch(`/api/v1/toys/${approved.id}`)
      .field('listingType', 'sell')
      .field('priceOrRate', '250000')
      .attach('images', JPEG, { filename: 'fourth.jpg', contentType: 'image/jpeg' });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('LISTING_TYPE_LOCKED');
    expect(storedToy(approved.id).listingType).toBe('rent');
    expect(ctx.uploads).toHaveLength(3);

    // Still fixed after an edit sent it back to review, and the same type is still accepted.
    const edited = await request(ctx.app)
      .patch(`/api/v1/toys/${approved.id}`)
      .send({ listingType: 'rent', title: 'Same Type' });
    expect(edited.status).toBe(200);
    expect(edited.body.status).toBe('pending');
    const stillRefused = await request(ctx.app)
      .patch(`/api/v1/toys/${approved.id}`)
      .send({ listingType: 'sell', priceOrRate: 250000 });
    expect(stillRefused.status).toBe(400);
    expect(stillRefused.body.error.code).toBe('LISTING_TYPE_LOCKED');
  });

  it('never turns a donation post into a rent or sale listing', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    // POST /donation-posts stores donation posts in the same collection.
    Object.assign(storedToy(listing.id), { listingType: 'donate', depositPrice: undefined });

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ listingType: 'rent', priceOrRate: 20000, depositPrice: 300000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'LISTING_TYPE_LOCKED',
      message: 'A donation post cannot become a rent or sale listing.',
    });
  });

  it('lets the Owner change the type of a listing that was never approved', async () => {
    const rejected = await createListing(ctx, ctx.actor1, sellFields());
    Object.assign(storedToy(rejected.id), {
      status: 'hidden',
      moderation: { reviewedBy: reviewer, reviewedAt, rejectReason: 'Sai loại tin' },
    });

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${rejected.id}`)
      .send({ listingType: 'rent', priceOrRate: 20000, depositPrice: 300000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ listingType: 'rent', status: 'pending' });
  });

  it('keeps a listing its Owner hid hidden', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    ctx.setActor(ctx.actor1);
    await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`).expect(200);

    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ title: 'Still Hidden' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('hidden');
  });
});

describe('POST /api/v1/toys/:toyId/hide', () => {
  it('hides an owned listing', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('hidden');
    expect(res.body.categoryName).toBe(CATEGORY_NAME);
  });

  it('returns 409 when an unfinished order exists', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.state.unfinishedOrder = true;
    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_IN_PROGRESS');
  });

  it('returns 403 when hiding another owner listing', async () => {
    const listing = await createListing(ctx, ctx.actor2, rentFields());

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`);

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/toys/:toyId', () => {
  it('deletes an owned listing and its image assets with 204', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    const publicIds = listing.images.map((image) => image.publicId);

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).delete(`/api/v1/toys/${listing.id}`);

    expect(res.status).toBe(204);
    expect(ctx.store).toHaveLength(0);
    expect(ctx.deletions).toContainEqual(publicIds);
  });

  it('returns 403 when deleting another owner listing', async () => {
    const listing = await createListing(ctx, ctx.actor2, rentFields());

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).delete(`/api/v1/toys/${listing.id}`);

    expect(res.status).toBe(403);
    expect(ctx.store).toHaveLength(1);
  });

  it('returns 409 when an unfinished order exists', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.state.unfinishedOrder = true;
    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).delete(`/api/v1/toys/${listing.id}`);

    expect(res.status).toBe(409);
    expect(ctx.store).toHaveLength(1);
  });
});

describe('ToyListingService actor policy', () => {
  // Over HTTP requireActor answers first; the service keeps the same policy for direct callers.
  it('refuses an Admin account with 403 FORBIDDEN and a missing or invalid actor with 401', async () => {
    const admin: RequestActor = {
      userId: new mongoose.Types.ObjectId().toString(),
      actorType: 'ADMIN',
    };
    await expect(ctx.service.listMine(admin, { page: 1, limit: 20 })).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Admin accounts cannot manage toy listings.',
    });
    await expect(
      ctx.service.hide(admin, new mongoose.Types.ObjectId().toString()),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    const invalid: RequestActor = { userId: 'not-an-id', actorType: 'ADMIN' };
    await expect(ctx.service.listMine(invalid, { page: 1, limit: 20 })).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
    await expect(
      ctx.service.listMine(undefined as unknown as RequestActor, { page: 1, limit: 20 }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
  });
});

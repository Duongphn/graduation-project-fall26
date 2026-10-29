import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose, { type Model } from 'mongoose';
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
    hasUnfinishedOrder: async () => state.unfinishedOrder,
    getSoldToyIds: async (toyIds) => new Set(toyIds.filter((id) => state.soldIds.has(id))),
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

function postListing(
  ctx: Context,
  fields: Record<string, string>,
  files: ImageInput[] = [DEFAULT_IMAGE],
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
    description: 'Barely used wooden train set',
    condition: 'good',
    categoryId: CATEGORY_ID,
    listingType: 'rent',
    priceOrRate: '12',
    depositPrice: '50',
    ageRange: JSON.stringify({ minAge: 3, maxAge: 8 }),
    ...overrides,
  };
}

function sellFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    title: 'LEGO Set',
    description: 'Complete LEGO set',
    condition: 'new',
    categoryId: CATEGORY_ID,
    listingType: 'sell',
    priceOrRate: '99',
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
      title: 'Wooden Train',
      listingType: 'rent',
      priceOrRate: 12,
      depositPrice: 50,
      status: 'pending',
      quantity: 1,
      ageRange: { minAge: 3, maxAge: 8 },
    });
    expect(listing.images).toHaveLength(1);
    expect(ctx.uploads).toEqual(['image/jpeg']);
  });

  it('creates a sell listing without a deposit', async () => {
    const listing = await createListing(ctx, ctx.actor1, sellFields());

    expect(listing.listingType).toBe('sell');
    expect(listing.depositPrice).toBeUndefined();
  });

  it('accepts a PNG image', async () => {
    ctx.setActor(ctx.actor1);
    const res = await postListing(ctx, rentFields(), [
      { buffer: PNG, contentType: 'image/png', filename: 'toy.png' },
    ]);

    expect(res.status).toBe(201);
    expect(ctx.uploads).toEqual(['image/png']);
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
    expect(res.body.error.message).toBe('At least one image is required.');
  });

  it('returns 400 for an image whose signature is invalid', async () => {
    ctx.setActor(ctx.actor1);
    const res = await postListing(ctx, rentFields(), [
      { buffer: NOT_AN_IMAGE, contentType: 'image/jpeg', filename: 'fake.jpg' },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE_FORMAT');
    expect(ctx.uploads).toHaveLength(0);
  });

  it('returns 400 when a sell listing supplies a deposit', async () => {
    ctx.setActor(ctx.actor1);
    const res = await postListing(ctx, sellFields({ depositPrice: '10' }));

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
      .send({ title: 'Updated Train', priceOrRate: 15 });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Train');
    expect(res.body.priceOrRate).toBe(15);
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

  it('returns 400 when removing every image', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ removeImagePublicIds: JSON.stringify([listing.images[0]?.publicId]) });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('A listing must have at least one image.');
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
    expect(res.body.images).toHaveLength(1);
    expect(res.body.images[0].publicId).not.toBe(oldPublicId);
    expect(ctx.deletions).toContainEqual([oldPublicId]);
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

describe('POST /api/v1/toys/:toyId/hide', () => {
  it('hides an owned listing', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('hidden');
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
    const publicId = listing.images[0]?.publicId ?? '';

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).delete(`/api/v1/toys/${listing.id}`);

    expect(res.status).toBe(204);
    expect(ctx.store).toHaveLength(0);
    expect(ctx.deletions).toContainEqual([publicId]);
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

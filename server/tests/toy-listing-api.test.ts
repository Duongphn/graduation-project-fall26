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
  safetyDeclaredAt?: Date;
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
  /** Calls of closePendingDonationRequests (D-06). */
  closedDonationRequests: Array<{ toyId: string; ownerId: string; why: string; title: string }>;
  /** Makes closePendingDonationRequests fail. */
  closeDonationFails?: boolean;
  /** Donation posts that were handed over (isDonated). */
  donatedIds: Set<string>;
}

function createPorts(options: PortOptions = {}): { ports: ToyListingPorts; state: PortState } {
  const state: PortState = {
    verified: options.verified ?? true,
    categoryExists: options.categoryExists ?? true,
    unfinishedOrder: options.unfinishedOrder ?? false,
    soldIds: new Set<string>(options.soldIds ?? []),
    closedDonationRequests: [],
    donatedIds: new Set<string>(),
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
    closePendingDonationRequests: async (toyId, ownerId, why, title) => {
      if (state.closeDonationFails) throw new Error('Closing the donation requests failed.');
      state.closedDonationRequests.push({ toyId, ownerId, why, title });
      return 1;
    },
    isDonated: async (toyId) => state.donatedIds.has(toyId),
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

// The fewest photos each listing type takes (GB-10): 3 for rent and for sale.
const MIN_PHOTOS: Record<string, number> = { rent: 3, sell: 3 };

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
    safetyDeclaration: 'true',
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
    safetyDeclaration: 'true',
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

/** The Admin approved the stored listing (UC27): active, with the review time. */
function approveStored(ctx: Context, toyId: string, reviewedAt = new Date()): void {
  const toy = ctx.store.find((doc) => doc._id.toString() === toyId);
  if (!toy) throw new Error(`toy ${toyId} not stored`);
  toy.status = 'active';
  toy.moderation = {
    submittedAt: new Date(reviewedAt.getTime() - 60_000),
    reviewedBy: new mongoose.Types.ObjectId(),
    reviewedAt,
  };
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

  it('takes 3 to 8 photos for a rental and for a sale (GB-10)', async () => {
    ctx.setActor(ctx.actor1);
    const tooFewRent = await postListing(ctx, rentFields(), images(2));
    expect(tooFewRent.status).toBe(400);
    expect(tooFewRent.body.error).toMatchObject({
      code: 'TOO_FEW_PHOTOS',
      message: 'Please upload at least 3 photos.',
    });

    const tooFewSale = await postListing(ctx, sellFields(), images(2));
    expect(tooFewSale.status).toBe(400);
    expect(tooFewSale.body.error.message).toBe('Please upload at least 3 photos.');

    const tooManySale = await postListing(ctx, sellFields(), images(9));
    expect(tooManySale.status).toBe(400);
    expect(tooManySale.body.error.code).toBe('TOO_MANY_PHOTOS');

    const tooMany = await postListing(ctx, rentFields(), images(9));
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error).toMatchObject({
      code: 'TOO_MANY_PHOTOS',
      message: 'Please upload no more than 8 photos.',
    });
    // Nothing is uploaded for a refused listing.
    expect(ctx.uploads).toHaveLength(0);

    expect((await postListing(ctx, rentFields(), images(8))).status).toBe(201);
    expect((await postListing(ctx, sellFields(), images(3))).status).toBe(201);
    expect((await postListing(ctx, sellFields(), images(8))).status).toBe(201);
  });

  it('accepts JPG, PNG and WebP photos (GB-10, MSG20) and refuses other types', async () => {
    const WEBP = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
    ]);
    const GIF = Buffer.from('GIF89a', 'ascii');
    ctx.setActor(ctx.actor1);
    const res = await postListing(ctx, sellFields(), [
      ...images(2),
      { buffer: PNG, contentType: 'image/png', filename: 'toy.png' },
      { buffer: WEBP, contentType: 'image/webp', filename: 'toy.webp' },
    ]);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(ctx.uploads).toEqual(['image/jpeg', 'image/jpeg', 'image/png', 'image/webp']);

    const gif = await postListing(ctx, rentFields(), [
      ...images(2),
      { buffer: GIF, contentType: 'image/gif', filename: 'toy.gif' },
    ]);
    expect(gif.status).toBe(400);
    expect(gif.body.error.code).toBe('INVALID_IMAGE_FORMAT');
    expect(ctx.uploads).toHaveLength(4);
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
    const patch = (body: object) => request(ctx.app)
        .patch(`/api/v1/toys/${listing.id}`)
        .send({ safetyDeclaration: true, ...body });
    expectFieldError(await patch({ description: 'Too short.' }), 'description');
    // The stored daily price is 20.000 đ.
    expectFieldError(await patch({ depositPrice: 10000 }), 'depositPrice');
    expectFieldError(await patch({ priceOrRate: 400000 }), 'depositPrice');
    expect((await patch({ priceOrRate: 300000 })).status).toBe(200);
    expect(ctx.store[0]?.priceOrRate).toBe(300000);
  });
});

describe('contact details in the title or description (R03 GB-11, MSG22)', () => {
  const expectContactError = (res: request.Response, field: 'title' | 'description') => {
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'CONTACT_DETAILS_NOT_ALLOWED',
      details: { field },
    });
    expect(res.body.error.message).toMatch(/^Không được ghi số điện thoại, email hoặc đường link/);
  };
  const LONG = 'Bộ đồ chơi còn rất mới, đủ phụ kiện và hộp, bé chơi rất ít lần. ';

  it('refuses a phone number, an email or a link on create, and uploads nothing', async () => {
    ctx.setActor(ctx.actor1);
    expectContactError(
      await postListing(ctx, rentFields({ title: 'Xe gỗ, gọi 0912 345 678' })),
      'title',
    );
    expectContactError(
      await postListing(ctx, sellFields({ description: `${LONG}Liên hệ +84 912.345.678.` })),
      'description',
    );
    expectContactError(
      await postListing(ctx, sellFields({ description: `${LONG}Email be.na@gmail.com` })),
      'description',
    );
    expectContactError(
      await postListing(ctx, rentFields({ description: `${LONG}Xem https://shopee.vn/xe` })),
      'description',
    );
    expectContactError(
      await postListing(ctx, rentFields({ title: 'Xe gỗ www.xego.vn' })),
      'title',
    );
    expect(ctx.uploads).toHaveLength(0);
    expect(ctx.store).toHaveLength(0);
  });

  it('accepts honest text that only gives the Admin a warning', async () => {
    ctx.setActor(ctx.actor1);
    for (const [title, description] of [
      ['Đồ chơi ngân hàng mini', `${LONG}Bé tập bỏ tiền tiết kiệm.`],
      ['Gấu bông Momo', `${LONG}Mẫu Labubu đang hot trên TikTok.`],
      ['Robot Tobot.vn chính hãng', `${LONG}Mã vạch hộp 8936036022345.`],
      ['Xe đua điều khiển', `${LONG}Số seri 2023 0915 1234, giá mua 1.250.000đ.`],
    ] as const) {
      const res = await postListing(ctx, rentFields({ title, description }));
      expect(res.status, `${title}: ${JSON.stringify(res.body)}`).toBe(201);
    }
  });

  it('refuses contact details on an edit too, and keeps the listing', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.setActor(ctx.actor1);
    const patch = (body: object) => request(ctx.app)
        .patch(`/api/v1/toys/${listing.id}`)
        .send({ safetyDeclaration: true, ...body });
    expectContactError(await patch({ title: 'Inbox www.facebook.com/xego' }), 'title');
    expectContactError(
      await patch({ description: `${LONG}Hỏi thêm qua 0987654321 nhé.` }),
      'description',
    );
    expect(ctx.store[0]?.title).toBe('Wooden Train');
    expect((await patch({ title: 'Tàu gỗ Momo' })).status).toBe(200);
  });
});

describe('safety declaration of the Owner (UC05)', () => {
  const storedToy = (id: string): FakeToy => {
    const toy = ctx.store.find((doc) => doc._id.toString() === id);
    if (!toy) throw new Error(`toy ${id} not stored`);
    return toy;
  };
  const withoutDeclaration = (fields: Record<string, string>): Record<string, string> => {
    const rest = { ...fields };
    delete rest.safetyDeclaration;
    return rest;
  };

  it('refuses a rent or sale listing without the declaration, and uploads nothing', async () => {
    ctx.setActor(ctx.actor1);
    for (const fields of [rentFields(), sellFields()]) {
      const res = await postListing(ctx, withoutDeclaration(fields));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({
        code: 'SAFETY_DECLARATION_REQUIRED',
        message: 'Vui lòng xác nhận cam kết an toàn trước khi đăng tin.',
        details: { field: 'safetyDeclaration' },
      });
    }
    expect(ctx.uploads).toHaveLength(0);
  });

  it('takes only true as the declaration', async () => {
    ctx.setActor(ctx.actor1);
    for (const value of ['false', 'on', '1']) {
      const res = await postListing(ctx, rentFields({ safetyDeclaration: value }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SAFETY_DECLARATION_REQUIRED');
    }
    expect(ctx.uploads).toHaveLength(0);
  });

  it('stores when the Owner declared the toy safe', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    expect(Number.isNaN(Date.parse(String(listing.safetyDeclaredAt)))).toBe(false);
    expect(storedToy(listing.id).safetyDeclaredAt).toBeInstanceOf(Date);
  });

  it('asks for the declaration again on every edit', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    const declaredAt = storedToy(listing.id).safetyDeclaredAt as Date;
    const uploadsBefore = ctx.uploads.length;

    ctx.setActor(ctx.actor1);
    const titleOnly = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ title: 'New Title' });
    expect(titleOnly.status).toBe(400);
    expect(titleOnly.body.error.code).toBe('SAFETY_DECLARATION_REQUIRED');

    const photoEdit = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .field('removeImagePublicIds', JSON.stringify([listing.images[0]?.publicId]))
      .attach('images', PNG, { filename: 'new.png', contentType: 'image/png' });
    expect(photoEdit.status).toBe(400);
    expect(photoEdit.body.error.code).toBe('SAFETY_DECLARATION_REQUIRED');
    expect(ctx.uploads.length).toBe(uploadsBefore);
    expect(ctx.deletions).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const declared = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ title: 'New Title', safetyDeclaration: true });
    expect(declared.status).toBe(200);
    expect(storedToy(listing.id).safetyDeclaredAt!.getTime()).toBeGreaterThan(
      declaredAt.getTime(),
    );
  });

  it('edits a donation post without the declaration', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    Object.assign(storedToy(listing.id), { listingType: 'donate', depositPrice: undefined });

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ title: 'Donation Title' });
    expect(res.status).toBe(200);
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
      .send({ safetyDeclaration: true, title: 'Updated Train', priceOrRate: 25000 });

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
      .send({ safetyDeclaration: true, title: 'Hijacked' });

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
      .send({ safetyDeclaration: true, removeImagePublicIds: JSON.stringify([listing.images[0]?.publicId]) });

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
      .send({ safetyDeclaration: true,
        listingType: 'sell',
        priceOrRate: 250000,
        removeImagePublicIds: JSON.stringify([listing.images[0]?.publicId]),
      });
    expect(tooFew.status).toBe(400);
    expect(tooFew.body.error.message).toBe('Please upload at least 3 photos.');

    const enough = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ safetyDeclaration: true, listingType: 'sell', priceOrRate: 250000 });
    expect(enough.status).toBe(200);
    expect(enough.body.images).toHaveLength(3);
  });

  it('replaces an image and deletes the removed asset', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    const oldPublicId = listing.images[0]?.publicId ?? '';

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .field('safetyDeclaration', 'true')
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
      .field('safetyDeclaration', 'true')
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
      .field('safetyDeclaration', 'true')
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
      .send({ safetyDeclaration: true, title: 'Updated Train' });

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
      .send({ safetyDeclaration: true, title: 'Clearer Photos' });

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
      .send({ safetyDeclaration: true, title: 'Typo Fixed' });

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
      .field('safetyDeclaration', 'true')
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
      .send({ safetyDeclaration: true, listingType: 'rent', title: 'Same Type' });
    expect(edited.status).toBe(200);
    expect(edited.body.status).toBe('pending');
    const stillRefused = await request(ctx.app)
      .patch(`/api/v1/toys/${approved.id}`)
      .send({ safetyDeclaration: true, listingType: 'sell', priceOrRate: 250000 });
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
      .send({ safetyDeclaration: true, listingType: 'rent', priceOrRate: 20000, depositPrice: 300000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'LISTING_TYPE_LOCKED',
      message: 'A donation post cannot become a rent or sale listing.',
    });
  });

  it('refuses contact details when a donation post is edited (GB-11)', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    Object.assign(storedToy(listing.id), { listingType: 'donate', depositPrice: undefined });

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ safetyDeclaration: true, title: 'Gấu bông, gọi 0912345678' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'CONTACT_DETAILS_NOT_ALLOWED',
      details: { field: 'title' },
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
      .send({ safetyDeclaration: true, listingType: 'rent', priceOrRate: 20000, depositPrice: 300000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ listingType: 'rent', status: 'pending' });
  });

  it('keeps a listing its Owner hid hidden, and marks it as edited since the review', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    approveStored(ctx, listing.id, reviewedAt);
    ctx.setActor(ctx.actor1);
    await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`).expect(200);

    const res = await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ safetyDeclaration: true, title: 'Still Hidden' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('hidden');
    const stored = storedToy(listing.id);
    expect(stored.moderation?.submittedAt?.getTime()).toBeGreaterThan(reviewedAt.getTime());
    expect(stored.moderation?.reviewedAt).toBe(reviewedAt);
  });
});

describe('POST /api/v1/toys/:toyId/hide', () => {
  it('hides an owned listing', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    approveStored(ctx, listing.id);

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('hidden');
    expect(res.body.categoryName).toBe(CATEGORY_NAME);
  });

  it('refuses to hide a listing waiting for review (R03 III.3.2.1: Edit and Delete only)', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_PENDING_REVIEW');
    expect(ctx.store[0]?.status).toBe('pending');
  });

  it('returns 409 when an unfinished order exists', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    approveStored(ctx, listing.id);

    ctx.state.unfinishedOrder = true;
    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_IN_PROGRESS');
  });

  it('closes the pending donation requests of a hidden donation post (D-06)', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    approveStored(ctx, listing.id);
    (ctx.store[0] as { listingType: string }).listingType = 'donate';

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`);

    expect(res.status).toBe(200);
    expect(ctx.state.closedDonationRequests).toEqual([
      { toyId: listing.id, ownerId: ctx.actor1.userId, why: 'HIDDEN', title: listing.title },
    ]);
  });

  it('leaves donation requests alone for a rent listing, and when the hide is refused', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    approveStored(ctx, listing.id);
    ctx.setActor(ctx.actor1);
    expect((await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`)).status).toBe(200);

    const donation = await createListing(ctx, ctx.actor1, rentFields());
    approveStored(ctx, donation.id);
    (ctx.store[1] as { listingType: string }).listingType = 'donate';
    // GB-12/GB-60: an accepted or shipping donation request blocks the hide.
    ctx.state.unfinishedOrder = true;
    const blocked = await request(ctx.app).post(`/api/v1/toys/${donation.id}/hide`);

    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ORDER_IN_PROGRESS');
    expect(ctx.state.closedDonationRequests).toEqual([]);
  });

  it('returns 403 when hiding another owner listing', async () => {
    const listing = await createListing(ctx, ctx.actor2, rentFields());

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/toys/:toyId/show (GB-08)', () => {
  const storedToy = (id: string): FakeToy => {
    const toy = ctx.store.find((doc) => doc._id.toString() === id);
    if (!toy) throw new Error(`toy ${id} not stored`);
    return toy;
  };
  const reviewedAt = new Date('2026-11-01T08:00:00Z');

  async function hiddenApprovedListing(): Promise<ToyListingDto> {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    approveStored(ctx, listing.id, reviewedAt);
    ctx.setActor(ctx.actor1);
    await request(ctx.app).post(`/api/v1/toys/${listing.id}/hide`).expect(200);
    return listing;
  }

  it('makes an approved listing that was not edited active again at once', async () => {
    const listing = await hiddenApprovedListing();

    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/show`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: listing.id, status: 'active', categoryName: CATEGORY_NAME });
    expect(storedToy(listing.id).status).toBe('active');
  });

  it('sends a listing edited while hidden back to pending review', async () => {
    const listing = await hiddenApprovedListing();
    await request(ctx.app)
      .patch(`/api/v1/toys/${listing.id}`)
      .send({ safetyDeclaration: true, title: 'Edited While Hidden' })
      .expect(200);

    const before = Date.now();
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/show`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    const stored = storedToy(listing.id);
    expect(stored.status).toBe('pending');
    // In the Admin queue from now on; the approval is kept for GB-09.
    expect(stored.moderation?.submittedAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.moderation?.reviewedAt).toBe(reviewedAt);
  });

  it('sends a hidden listing that was never approved to pending review', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    // Hidden while pending, before hiding a pending listing was refused.
    storedToy(listing.id).status = 'hidden';

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/show`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });

  it('refuses a rejected listing: it must be edited and sent again', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    Object.assign(storedToy(listing.id), {
      status: 'hidden',
      moderation: { reviewedAt, rejectReason: 'Ảnh bị mờ' },
    });

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/show`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_REJECTED');
    expect(storedToy(listing.id).status).toBe('hidden');
  });

  it('refuses a listing that is not hidden, or sold', async () => {
    const pending = await createListing(ctx, ctx.actor1, rentFields());
    ctx.setActor(ctx.actor1);
    const notHidden = await request(ctx.app).post(`/api/v1/toys/${pending.id}/show`);
    expect(notHidden.status).toBe(409);
    expect(notHidden.body.error.code).toBe('LISTING_NOT_HIDDEN');

    const sold = await hiddenApprovedListing();
    ctx.state.soldIds.add(sold.id);
    const soldRes = await request(ctx.app).post(`/api/v1/toys/${sold.id}/show`);
    expect(soldRes.status).toBe(409);
    expect(soldRes.body.error.code).toBe('LISTING_NOT_HIDDEN');
    expect(storedToy(sold.id).status).toBe('hidden');
  });

  it('keeps a donation post that is being handed over or was given away hidden', async () => {
    const listing = await hiddenApprovedListing();
    (storedToy(listing.id) as { listingType: string }).listingType = 'donate';

    ctx.state.unfinishedOrder = true;
    const giving = await request(ctx.app).post(`/api/v1/toys/${listing.id}/show`);
    expect(giving.status).toBe(409);
    expect(giving.body.error.code).toBe('ORDER_IN_PROGRESS');

    ctx.state.unfinishedOrder = false;
    ctx.state.donatedIds.add(listing.id);
    const donated = await request(ctx.app).post(`/api/v1/toys/${listing.id}/show`);
    expect(donated.status).toBe(409);
    expect(donated.body.error.code).toBe('TOY_DONATED');
    expect(storedToy(listing.id).status).toBe('hidden');

    ctx.state.donatedIds.clear();
    const shown = await request(ctx.app).post(`/api/v1/toys/${listing.id}/show`);
    expect(shown.status).toBe(200);
    expect(shown.body.status).toBe('active');
  });

  it("returns 403 for another Owner's listing", async () => {
    const listing = await hiddenApprovedListing();

    ctx.setActor(ctx.actor2);
    const res = await request(ctx.app).post(`/api/v1/toys/${listing.id}/show`);

    expect(res.status).toBe(403);
    expect(storedToy(listing.id).status).toBe('hidden');
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

  it('closes the pending donation requests of a deleted donation post (D-06)', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    (ctx.store[0] as { listingType: string }).listingType = 'donate';

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).delete(`/api/v1/toys/${listing.id}`);

    expect(res.status).toBe(204);
    expect(ctx.store).toHaveLength(0);
    expect(ctx.state.closedDonationRequests).toEqual([
      { toyId: listing.id, ownerId: ctx.actor1.userId, why: 'DELETED', title: listing.title },
    ]);
  });

  it('still deletes the donation post when closing its requests fails', async () => {
    const listing = await createListing(ctx, ctx.actor1, rentFields());
    (ctx.store[0] as { listingType: string }).listingType = 'donate';
    ctx.state.closeDonationFails = true;

    ctx.setActor(ctx.actor1);
    const res = await request(ctx.app).delete(`/api/v1/toys/${listing.id}`);

    expect(res.status).toBe(204);
    expect(ctx.store).toHaveLength(0);
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
    await expect(
      ctx.service.show(admin, new mongoose.Types.ObjectId().toString()),
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

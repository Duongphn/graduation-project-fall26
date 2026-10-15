import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApiRouter } from '../src/app/router.js';
import { createToyCatalogDependencies } from '../src/app/toy-catalog-dependencies.js';
import type {
  CatalogToyRecord,
  ToyCatalogFilter,
  ToyCatalogPorts,
  ToyCatalogRepository,
} from '../src/features/toys/toy-catalog.types.js';
import { errorHandler } from '../src/shared/middleware/error-handler.js';

const CATEGORY_A = new mongoose.Types.ObjectId().toString();
const CATEGORY_B = new mongoose.Types.ObjectId().toString();
const NOW = new Date('2026-10-14T00:00:00.000Z');

interface FakeToy extends CatalogToyRecord {
  status: 'pending' | 'active' | 'hidden';
  ownerId: string;
}

let sequence = 0;

function makeToy(overrides: Partial<FakeToy> = {}): FakeToy {
  sequence += 1;
  return {
    id: new mongoose.Types.ObjectId().toString(),
    ownerId: new mongoose.Types.ObjectId().toString(),
    categoryId: CATEGORY_A,
    title: `Đồ chơi ${sequence}`,
    condition: 'Như mới (90–99%)',
    listingType: 'rent',
    priceOrRate: 25_000,
    depositPrice: 400_000,
    ageRange: { minAge: 3, maxAge: 8 },
    images: [],
    createdAt: new Date(NOW.getTime() - sequence * 60_000),
    status: 'active',
    ...overrides,
  };
}

/** Repository giả: áp dụng cùng bộ lọc như MongoToyCatalogRepository trên mảng trong bộ nhớ */
function createFakeRepository(toys: FakeToy[]): ToyCatalogRepository {
  const matches = (toy: FakeToy, filter: ToyCatalogFilter) =>
    toy.status === 'active' &&
    (!filter.listingType || toy.listingType === filter.listingType) &&
    (!filter.categoryId || toy.categoryId === filter.categoryId) &&
    (filter.maxAge === undefined || toy.ageRange.minAge <= filter.maxAge) &&
    (filter.minAge === undefined || toy.ageRange.maxAge >= filter.minAge) &&
    !filter.excludeIds.includes(toy.id);

  // Chỉ giữ các trường công khai, giống projection của repository thật
  const toRecord = (toy: FakeToy): CatalogToyRecord => ({
    id: toy.id,
    categoryId: toy.categoryId,
    title: toy.title,
    condition: toy.condition,
    listingType: toy.listingType,
    priceOrRate: toy.priceOrRate,
    depositPrice: toy.depositPrice,
    ageRange: toy.ageRange,
    images: toy.images,
    createdAt: toy.createdAt,
  });

  return {
    async count(filter) {
      return toys.filter((toy) => matches(toy, filter)).length;
    },
    async findNewest(filter, skip, limit) {
      return toys
        .filter((toy) => matches(toy, filter))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(skip, skip + limit)
        .map(toRecord);
    },
    async findByIds(filter, ids) {
      return toys.filter((toy) => ids.includes(toy.id) && matches(toy, filter)).map(toRecord);
    },
  };
}

function setup(toys: FakeToy[], ports: Partial<ToyCatalogPorts> = {}) {
  const deps = createToyCatalogDependencies({
    repository: createFakeRepository(toys),
    ports: {
      getSoldToyIds: async () => [],
      getRentalCountsSince: async () => new Map(),
      ...ports,
    },
  });

  const app = express();
  app.use('/api/v1/toys', deps.router);
  app.use(errorHandler);
  return app;
}

describe('GET /api/v1/toys (public catalog)', () => {
  it('lets guests list toys without authentication', async () => {
    const app = setup([makeToy()]);

    const response = await request(app).get('/api/v1/toys');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, limit: 20, total: 1 });
    expect(response.body.items).toHaveLength(1);
  });

  it('returns only active, unsold listings', async () => {
    const active = makeToy();
    const sold = makeToy({ listingType: 'sell', depositPrice: undefined });
    const app = setup([active, sold, makeToy({ status: 'pending' }), makeToy({ status: 'hidden' })], {
      getSoldToyIds: async () => [sold.id],
    });

    const response = await request(app).get('/api/v1/toys');

    expect(response.body.total).toBe(1);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([active.id]);
  });

  it('never exposes owner, location or image public ids', async () => {
    const app = setup([makeToy({ images: [{ url: 'https://img.example/toy.jpg' }] })]);

    const [item] = (await request(app).get('/api/v1/toys')).body.items;

    expect(item).not.toHaveProperty('ownerId');
    expect(item).not.toHaveProperty('location');
    expect(item).not.toHaveProperty('status');
    expect(item.images).toEqual([{ url: 'https://img.example/toy.jpg' }]);
  });

  it('only returns depositPrice for rental listings', async () => {
    const app = setup([
      makeToy({ listingType: 'rent', depositPrice: 300_000 }),
      makeToy({ listingType: 'sell', depositPrice: 999 }),
    ]);

    const response = await request(app).get('/api/v1/toys');
    const byType = Object.fromEntries(
      response.body.items.map((item: { listingType: string }) => [item.listingType, item]),
    );

    expect(byType.rent.depositPrice).toBe(300_000);
    expect(byType.sell).not.toHaveProperty('depositPrice');
  });

  it('filters by listing type, category and overlapping age range', async () => {
    const match = makeToy({ listingType: 'sell', categoryId: CATEGORY_B, ageRange: { minAge: 6, maxAge: 12 } });
    const app = setup([
      match,
      makeToy({ listingType: 'rent', categoryId: CATEGORY_B, ageRange: { minAge: 6, maxAge: 12 } }),
      makeToy({ listingType: 'sell', categoryId: CATEGORY_A, ageRange: { minAge: 6, maxAge: 12 } }),
      makeToy({ listingType: 'sell', categoryId: CATEGORY_B, ageRange: { minAge: 0, maxAge: 2 } }),
    ]);

    const response = await request(app)
      .get('/api/v1/toys')
      .query({ listingType: 'sell', categoryId: CATEGORY_B, minAge: 9, maxAge: 12 });

    expect(response.status).toBe(200);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([match.id]);
  });

  it('sorts newest first by default and paginates', async () => {
    const [newest, middle, oldest] = [makeToy(), makeToy(), makeToy()]; // tin tạo sau có createdAt cũ hơn
    const app = setup([oldest, newest, middle]);

    const firstPage = await request(app).get('/api/v1/toys').query({ limit: 2 });
    const secondPage = await request(app).get('/api/v1/toys').query({ page: 2, limit: 2 });

    expect(firstPage.body.items.map((item: { id: string }) => item.id)).toEqual([newest.id, middle.id]);
    expect(secondPage.body).toMatchObject({ page: 2, limit: 2, total: 3 });
    expect(secondPage.body.items.map((item: { id: string }) => item.id)).toEqual([oldest.id]);
  });

  it('puts recently rented toys first for sort=popular, then falls back to newest', async () => {
    const [newest, middle, oldest] = [makeToy(), makeToy(), makeToy()];
    let requestedSince: Date | undefined;
    const app = setup([newest, middle, oldest], {
      getRentalCountsSince: async (since) => {
        requestedSince = since;
        return new Map([
          [oldest.id, 5],
          [middle.id, 2],
        ]);
      },
    });

    const firstPage = await request(app).get('/api/v1/toys').query({ sort: 'popular', limit: 2 });
    const secondPage = await request(app).get('/api/v1/toys').query({ sort: 'popular', limit: 2, page: 2 });

    expect(firstPage.body.items.map((item: { id: string }) => item.id)).toEqual([oldest.id, middle.id]);
    expect(secondPage.body.items.map((item: { id: string }) => item.id)).toEqual([newest.id]);
    expect(firstPage.body.total).toBe(3);
    expect(requestedSince).toBeInstanceOf(Date);
  });

  it('caps limit at 100', async () => {
    const app = setup([makeToy()]);

    const response = await request(app).get('/api/v1/toys').query({ limit: 500 });

    expect(response.body.limit).toBe(100);
  });

  it.each([
    ['listingType', { listingType: 'donate' }],
    ['sort', { sort: 'cheapest' }],
    ['categoryId', { categoryId: 'not-an-id' }],
    ['page', { page: 0 }],
    ['limit', { limit: 'abc' }],
    ['minAge > maxAge', { minAge: 8, maxAge: 3 }],
  ])('rejects invalid %s with 400 VALIDATION_ERROR', async (_label, query) => {
    const app = setup([makeToy()]);

    const response = await request(app).get('/api/v1/toys').query(query);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects repeated query parameters', async () => {
    const app = setup([makeToy()]);

    const response = await request(app).get('/api/v1/toys?listingType=rent&listingType=sell');

    expect(response.status).toBe(400);
  });
});

describe('API router mount order', () => {
  function createAppWithFullRouter() {
    const toyCatalogDependencies = createToyCatalogDependencies({
      repository: createFakeRepository([makeToy()]),
      ports: { getSoldToyIds: async () => [], getRentalCountsSince: async () => new Map() },
    });
    const app = express();
    app.use('/api/v1', createApiRouter({ toyCatalogDependencies }));
    app.use(errorHandler);
    return app;
  }

  it('serves GET /toys publicly', async () => {
    const response = await request(createAppWithFullRouter()).get('/api/v1/toys');

    expect(response.status).toBe(200);
  });

  it('still requires authentication for the listing routes', async () => {
    const app = createAppWithFullRouter();

    const [mine, create] = await Promise.all([
      request(app).get('/api/v1/toys/mine'),
      request(app).post('/api/v1/toys').send({}),
    ]);

    expect(mine.status).toBe(401);
    expect(create.status).toBe(401);
  });
});

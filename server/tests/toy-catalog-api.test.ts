import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createToyCatalogRouter } from '../src/features/toys/toy-catalog.routes.js';
import { ToyCatalogService } from '../src/features/toys/toy-catalog.service.js';
import type {
  OccupiedRentalPeriod,
  ToyCardDto,
  ToyCatalogReadPort,
  ToyDetailDto,
} from '../src/features/toys/toy-catalog.ports.js';
import { errorHandler } from '../src/shared/middleware/error-handler.js';

describe('UC05 Toy Catalog API', () => {
  let app: express.Express;
  let mockPort: ToyCatalogReadPort;
  let service: ToyCatalogService;

  const sampleCard: ToyCardDto = {
    id: '64b000000000000000000001',
    title: 'LEGO Star Wars X-Wing',
    primaryImage: { url: 'https://cloudinary.com/xwing.jpg', publicId: 'toyflow/xwing' },
    listingType: 'rent',
    priceOrRate: 50000,
    depositPrice: 200000,
    category: { id: '64b000000000000000000099', name: 'Building Toys', slug: 'building-toys' },
    ageRange: { minAge: 8, maxAge: 14 },
    condition: 'like_new',
    location: { type: 'Point', coordinates: [106.66, 10.76] },
    createdAt: '2026-10-14T00:00:00.000Z',
  };

  const sampleDetail: ToyDetailDto = {
    id: '64b000000000000000000001',
    title: 'LEGO Star Wars X-Wing',
    description: 'Detailed LEGO set with Luke Skywalker minifigure.',
    images: [{ url: 'https://cloudinary.com/xwing.jpg', publicId: 'toyflow/xwing' }],
    listingType: 'rent',
    priceOrRate: 50000,
    depositPrice: 200000,
    category: { id: '64b000000000000000000099', name: 'Building Toys', slug: 'building-toys' },
    ageRange: { minAge: 8, maxAge: 14 },
    condition: 'like_new',
    location: { type: 'Point', coordinates: [106.66, 10.76] },
    owner: { id: '64b000000000000000000088', displayName: 'Nguyen Van A' },
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T00:00:00.000Z',
  };

  beforeEach(() => {
    mockPort = {
      search: async () => ({
        items: [sampleCard],
        total: 1,
      }),
      findActiveDetail: async (toyId: string) => {
        if (toyId === sampleDetail.id) {
          return sampleDetail;
        }
        return null;
      },
      findAvailability: async (): Promise<OccupiedRentalPeriod[]> => [
        { startDate: '2026-10-20', endDate: '2026-10-25' },
      ],
    };

    service = new ToyCatalogService(mockPort);
    app = express();
    app.use(express.json());
    app.use('/api/v1/toys', createToyCatalogRouter(service));
    app.use(errorHandler);
  });

  describe('GET /api/v1/toys (search)', () => {
    it('returns 200 with search results and empty suggestions when items exist', async () => {
      const res = await request(app).get('/api/v1/toys?q=lego&page=1&limit=20');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('LEGO Star Wars X-Wing');
      expect(res.body.suggestions).toEqual([]);
    });

    it('returns actionable suggestions when search results are empty', async () => {
      mockPort.search = async () => ({ items: [], total: 0 });

      const res = await request(app).get(
        '/api/v1/toys?q=nonexistent&type=rent&ageMin=5&ageMax=10&minPrice=10000&maxPrice=50000&lat=10.76&lng=106.66&radiusKm=5',
      );

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.items).toEqual([]);
      expect(res.body.suggestions.length).toBeGreaterThan(0);

      const filters = res.body.suggestions.map((s: { filter: string }) => s.filter);
      expect(filters).toContain('keyword');
      expect(filters).toContain('type');
      expect(filters).toContain('ageRange');
      expect(filters).toContain('priceRange');
      expect(filters).toContain('area');
    });

    it('returns 400 when coordinates are provided without radiusKm', async () => {
      const res = await request(app).get('/api/v1/toys?lat=10.76&lng=106.66');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when radiusKm is outside (0, 100]', async () => {
      const res1 = await request(app).get('/api/v1/toys?lat=10.76&lng=106.66&radiusKm=0');
      expect(res1.status).toBe(400);

      const res2 = await request(app).get('/api/v1/toys?lat=10.76&lng=106.66&radiusKm=105');
      expect(res2.status).toBe(400);
    });

    it('returns 400 when sort=distance is requested without coordinates', async () => {
      const res = await request(app).get('/api/v1/toys?sort=distance');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when ageMin > ageMax', async () => {
      const res = await request(app).get('/api/v1/toys?ageMin=10&ageMax=5');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when minPrice > maxPrice', async () => {
      const res = await request(app).get('/api/v1/toys?minPrice=50000&maxPrice=10000');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/toys/:toyId (detail)', () => {
    it('returns 200 with detail and safe owner summary', async () => {
      const res = await request(app).get(`/api/v1/toys/${sampleDetail.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sampleDetail.id);
      expect(res.body.title).toBe(sampleDetail.title);
      expect(res.body.owner).toEqual({
        id: '64b000000000000000000088',
        displayName: 'Nguyen Van A',
      });
      // Verify no sensitive fields leaked
      expect(res.body.owner.email).toBeUndefined();
      expect(res.body.owner.phone).toBeUndefined();
      expect(res.body.owner.passwordHash).toBeUndefined();
    });

    it('returns 400 when toyId is not a valid ObjectId', async () => {
      const res = await request(app).get('/api/v1/toys/invalid-id');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TOY_ID');
    });

    it('returns 404 when toy is not found or not active', async () => {
      const res = await request(app).get('/api/v1/toys/64b000000000000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/v1/toys/:toyId/availability (calendar)', () => {
    const validFrom = '2026-11-01';
    const validTo = '2026-11-30';

    it('returns 200 with occupied periods', async () => {
      const res = await request(app).get(
        `/api/v1/toys/${sampleDetail.id}/availability?from=${validFrom}&to=${validTo}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.periods).toEqual([{ startDate: '2026-10-20', endDate: '2026-10-25' }]);
    });

    it('returns 400 when from or to is missing', async () => {
      const res1 = await request(app).get(
        `/api/v1/toys/${sampleDetail.id}/availability?from=${validFrom}`,
      );
      expect(res1.status).toBe(400);

      const res2 = await request(app).get(
        `/api/v1/toys/${sampleDetail.id}/availability?to=${validTo}`,
      );
      expect(res2.status).toBe(400);
    });

    it('returns 400 when from > to', async () => {
      const res = await request(app).get(
        `/api/v1/toys/${sampleDetail.id}/availability?from=2026-11-30&to=2026-11-01`,
      );

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when window exceeds 180 days', async () => {
      const res = await request(app).get(
        `/api/v1/toys/${sampleDetail.id}/availability?from=2026-11-01&to=2027-06-01`,
      );

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when toy does not exist', async () => {
      const res = await request(app).get(
        `/api/v1/toys/64b000000000000000000000/availability?from=${validFrom}&to=${validTo}`,
      );

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
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

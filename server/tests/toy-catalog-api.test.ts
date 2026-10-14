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
  });
});

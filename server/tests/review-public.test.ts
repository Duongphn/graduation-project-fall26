import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Review, type ReviewDirection } from '../src/models/index.js';
import { buildRentalApp, createRentToy, createUser } from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('UC24: public review lists', () => {
  let app: any;
  let ownerId: string;
  let toyId: string;

  const seed = async (direction: ReviewDirection, userRating: number, at: string, to = ownerId) => {
    const reviewer = await createUser();
    return Review.create({
      orderType: 'rental_order',
      orderId: new mongoose.Types.ObjectId(),
      direction,
      reviewerId: reviewer._id,
      revieweeId: new mongoose.Types.ObjectId(to),
      toyId: new mongoose.Types.ObjectId(toyId),
      userRating,
      ...(direction === 'RENTER_TO_OWNER' ? { toyRating: userRating } : {}),
      createdAt: new Date(at),
    });
  };

  beforeAll(async () => {
    await startReplSet();
  });
  afterAll(async () => {
    await stopReplSet();
  });
  beforeEach(async () => {
    await resetDatabase();
    app = buildRentalApp().app;
    ownerId = String((await createUser())._id);
    toyId = String((await createRentToy(ownerId))._id);
  });

  it('lists toy reviews newest first without contact data', async () => {
    await seed('RENTER_TO_OWNER', 3, '2026-11-01T00:00:00Z');
    const newer = await seed('RENTER_TO_OWNER', 5, '2026-11-02T00:00:00Z');
    await seed('OWNER_TO_RENTER', 4, '2026-11-03T00:00:00Z');

    const res = await request(app).get(`/api/v1/toys/${toyId}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items[0].id).toBe(String(newer._id));
    expect(Object.keys(res.body.data.items[0].reviewer).sort()).toEqual(['fullName', 'id']);
    expect(JSON.stringify(res.body)).not.toMatch(/phone|email/);
  });

  it('hidden toy reviews are 404', async () => {
    const hidden = await createRentToy(ownerId, { status: 'hidden' });
    const res = await request(app).get(`/api/v1/toys/${hidden._id}/reviews`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TOY_NOT_FOUND');
  });

  it('unknown toy is 404', async () => {
    const res = await request(app).get(`/api/v1/toys/${new mongoose.Types.ObjectId()}/reviews`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TOY_NOT_FOUND');
  });

  it('lists user reviews filtered by role', async () => {
    await seed('RENTER_TO_OWNER', 3, '2026-11-01T00:00:00Z');
    await seed('RENTER_TO_OWNER', 5, '2026-11-02T00:00:00Z');
    await seed('OWNER_TO_RENTER', 4, '2026-11-03T00:00:00Z');
    const url = `/api/v1/users/${ownerId}/reviews`;

    expect((await request(app).get(url)).body.data.total).toBe(3);
    expect((await request(app).get(`${url}?role=owner`)).body.data.total).toBe(2);
    expect((await request(app).get(`${url}?role=renter`)).body.data.total).toBe(1);
    const bad = await request(app).get(`${url}?role=x`);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('unknown user is 404 USER_NOT_FOUND', async () => {
    const res = await request(app).get(`/api/v1/users/${new mongoose.Types.ObjectId()}/reviews`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('paginates and caps the limit', async () => {
    await seed('RENTER_TO_OWNER', 3, '2026-11-01T00:00:00Z');
    const second = await seed('RENTER_TO_OWNER', 4, '2026-11-02T00:00:00Z');
    await seed('RENTER_TO_OWNER', 5, '2026-11-03T00:00:00Z');

    const tooBig = await request(app).get(`/api/v1/toys/${toyId}/reviews?limit=51`);
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error.code).toBe('VALIDATION_ERROR');

    const page = await request(app).get(`/api/v1/toys/${toyId}/reviews?limit=1&page=2`);
    expect(page.body.data).toMatchObject({ total: 3, page: 2, limit: 1 });
    expect(page.body.data.items).toHaveLength(1);
    expect(page.body.data.items[0].id).toBe(String(second._id));
  });
});

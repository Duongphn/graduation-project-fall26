import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import type { ToyListingService } from '../src/services/toy-listing.service.js';

function bearer(role: 'USER' | 'ADMIN' = 'USER'): string {
  const userId = new mongoose.Types.ObjectId().toString();
  return `Bearer ${jwt.sign({ userId, role }, env.jwtAccessSecret, { expiresIn: '1h' })}`;
}

describe('toy listing routes authenticate the bearer token', () => {
  it('lets a signed-in user reach GET /toys/mine', async () => {
    const page = { items: [], page: 1, limit: 20, total: 0 };
    const listMine = vi.fn().mockResolvedValue(page);
    const app = createApp({ toyListingService: { listMine } as unknown as ToyListingService });

    const res = await request(app).get('/api/v1/toys/mine').set('Authorization', bearer());

    expect(res.status).toBe(200);
    expect(res.body).toEqual(page);
    expect(listMine).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'USER' }),
      expect.objectContaining({ page: 1 }),
    );
  });

  it('still rejects GET /toys/mine without a token', async () => {
    const listMine = vi.fn();
    const app = createApp({ toyListingService: { listMine } as unknown as ToyListingService });

    const res = await request(app).get('/api/v1/toys/mine');

    expect(res.status).toBe(401);
    expect(listMine).not.toHaveBeenCalled();
  });

  it('rejects an invalid token on POST /toys/:toyId/hide', async () => {
    const hide = vi.fn();
    const app = createApp({ toyListingService: { hide } as unknown as ToyListingService });

    const res = await request(app)
      .post(`/api/v1/toys/${new mongoose.Types.ObjectId().toString()}/hide`)
      .set('Authorization', 'Bearer not-a-jwt');

    expect(res.status).toBe(401);
    expect(hide).not.toHaveBeenCalled();
  });
});

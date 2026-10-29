import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { CategoryController } from '../src/controllers/category.controller.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { CategoryService } from '../src/services/category.service.js';

describe('GET /api/v1/categories', () => {
  it('lists active categories in menu order with public fields only', async () => {
    const id1 = new mongoose.Types.ObjectId();
    const id2 = new mongoose.Types.ObjectId();
    const lean = vi.fn().mockResolvedValue([
      { _id: id1, name: 'B', slug: 'b', parent_id: null },
      { _id: id2, name: 'A', slug: 'a', parent_id: id1 },
    ]);
    const sort = vi.fn().mockReturnValue({ lean });
    const find = vi.fn().mockReturnValue({ sort });
    const fakeModel = { find } as unknown as ConstructorParameters<typeof CategoryService>[0];

    const app = express();
    app.get('/api/v1/categories', new CategoryController(new CategoryService(fakeModel)).list);
    app.use(errorHandler);

    const res = await request(app).get('/api/v1/categories');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: String(id1), name: 'B', slug: 'b', parentId: null },
      { id: String(id2), name: 'A', slug: 'a', parentId: String(id1) },
    ]);
    expect(find).toHaveBeenCalledWith({ status: { $regex: /^active$/i } });
    expect(sort).toHaveBeenCalledWith({ displayOrder: 1, name: 1 });
  });
});

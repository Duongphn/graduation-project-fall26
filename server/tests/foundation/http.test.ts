import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app/create-app.js';
import { conflict } from '../../src/shared/errors/http-errors.js';
import { idParamsSchema, paginationQuerySchema } from '../../src/shared/http/schemas.js';
import { errorHandler } from '../../src/shared/middleware/error-handler.js';
import { notFoundHandler } from '../../src/shared/middleware/not-found.js';
import {
  getValidatedParams,
  getValidatedQuery,
  validateRequest,
} from '../../src/shared/middleware/validate.js';
import {
  buildPaginationMeta,
  sendCreated,
  sendPaginated,
  sendSuccess,
  toMongoPaging,
} from '../../src/shared/utils/response.js';
import { z } from '../../src/shared/validation/zod.js';

const buildApp = (setup: (app: express.Express) => void) => {
  const app = express();
  app.use(express.json());
  setup(app);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

const throwing = (error: unknown) =>
  buildApp((app) =>
    app.get('/boom', () => {
      throw error;
    }),
  );

describe('response envelopes', () => {
  const app = buildApp((app) => {
    app.get('/one', (_request, response) => sendSuccess(response, { id: 1 }, { message: 'Ok' }));
    app.post('/new', (_request, response) => sendCreated(response, { id: 2 }));
    app.get('/list', (_request, response) =>
      sendPaginated(response, [{ id: 1 }], { page: 2, limit: 1 }, 3),
    );
  });

  it('wraps data in { success, data, message? }', async () => {
    const one = await request(app).get('/one');
    expect(one.body).toEqual({ success: true, data: { id: 1 }, message: 'Ok' });
    const created = await request(app).post('/new');
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ success: true, data: { id: 2 } });
  });

  it('adds pagination meta to lists', async () => {
    const list = await request(app).get('/list');
    expect(list.body).toEqual({
      success: true,
      data: [{ id: 1 }],
      pagination: {
        page: 2,
        limit: 1,
        totalItems: 3,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      },
    });
  });

  it('answers unknown routes with the develop error format', async () => {
    const response = await request(createApp()).get('/api/v1/nothing-here');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } });
  });
});

// Develop's errorHandler: { error: { code, message, details } } for AppError and Zod errors.
describe('error handler', () => {
  it('maps AppError', async () => {
    const response = await request(throwing(conflict('TAKEN', 'Đã có.', { a: 1 }))).get('/boom');
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'TAKEN', message: 'Đã có.', details: { a: 1 } },
    });
  });

  it('maps Zod errors to VALIDATION_ERROR', async () => {
    const zodError = z.object({ name: z.string() }).safeParse({}).error;
    const zod = await request(throwing(zodError)).get('/boom');
    expect(zod.status).toBe(400);
    expect(zod.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('validateRequest', () => {
  const app = buildApp((app) =>
    app.post(
      '/items/:id',
      validateRequest({
        params: idParamsSchema,
        query: paginationQuerySchema,
        body: z.object({ name: z.string().trim().min(2) }),
      }),
      (request, response) =>
        sendSuccess(response, {
          params: getValidatedParams(response),
          query: getValidatedQuery(response),
          body: request.body,
        }),
    ),
  );

  it('passes parsed values with defaults', async () => {
    const response = await request(app)
      .post('/items/67098e1b34e12c001a123456?page=2')
      .send({ name: '  Lego ' });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      params: { id: '67098e1b34e12c001a123456' },
      query: { page: 2, limit: 10, sortOrder: 'desc' },
      body: { name: 'Lego' },
    });
  });

  it('collects every invalid field with its location', async () => {
    const response = await request(app).post('/items/bad?limit=500').send({ name: '' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const fields = response.body.error.details.map((item: { field: string }) => item.field);
    expect(fields).toEqual(['params.id', 'query.limit', 'name']);
  });
});

describe('pagination helpers', () => {
  it('computes meta for an empty list', () => {
    expect(buildPaginationMeta({ page: 1, limit: 10 }, 0)).toMatchObject({
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it('only sorts on allowed fields, with an _id tie-breaker', () => {
    const query = paginationQuerySchema.parse({ page: '3', limit: '20', sortBy: 'passwordHash' });
    expect(toMongoPaging(query, ['name', 'createdAt'])).toEqual({
      skip: 40,
      limit: 20,
      sort: { createdAt: -1, _id: -1 },
    });
    const byName = paginationQuerySchema.parse({ sortBy: 'name', sortOrder: 'asc' });
    expect(toMongoPaging(byName, ['name']).sort).toEqual({ name: 1, _id: 1 });
  });
});

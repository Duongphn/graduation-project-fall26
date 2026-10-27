import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ADMIN_ID = '67098e1b34e12c001a123456';
const USER_ID = '67098e1b34e12c001a123457';

// env is read once when config/env.ts is imported, so each case loads fresh modules.
const loadApp = async (variables: Record<string, string>) => {
  vi.resetModules();
  for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value);
  const { env } = await import('../../src/config/env.js');
  const { authenticate } = await import('../../src/middlewares/authenticate.js');
  const { errorHandler } = await import('../../src/middlewares/error-handler.js');
  const { uploadsRouter } = await import('../../src/routes/upload.routes.js');
  const { createDocsRouter } = await import('../../src/config/openapi.js');
  await import('../../src/routes/health.openapi.js');

  const app = express();
  app.use(express.json());
  app.use('/api/v1/docs', createDocsRouter());
  app.use('/api/v1/uploads', authenticate, uploadsRouter);
  app.use(errorHandler);
  const token = (userId: string, role: 'USER' | 'ADMIN') =>
    jwt.sign({ userId, role }, env.jwtAccessSecret, { expiresIn: '5m' });
  return { app, token };
};

afterEach(() => {
  vi.unstubAllEnvs();
});

const CLOUDINARY = {
  NODE_ENV: 'test',
  CLOUDINARY_CLOUD_NAME: 'demo',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
};

describe('upload signing behind develop auth', () => {
  it('answers 401 without a valid access token', async () => {
    const { app } = await loadApp(CLOUDINARY);
    const missing = await request(app).post('/api/v1/uploads/signature').send({ purpose: 'TOY_PHOTO' });
    expect(missing.status).toBe(401);
    expect(missing.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    const forged = await request(app)
      .post('/api/v1/uploads/signature')
      .set('Authorization', `Bearer ${jwt.sign({ userId: USER_ID, role: 'USER' }, 'other')}`)
      .send({ purpose: 'TOY_PHOTO' });
    expect(forged.status).toBe(401);
  });

  it('signs an upload bound to the caller', async () => {
    const { app, token } = await loadApp(CLOUDINARY);
    const sign = (userId: string, role: 'USER' | 'ADMIN', purpose: string) =>
      request(app)
        .post('/api/v1/uploads/signature')
        .set('Authorization', `Bearer ${token(userId, role)}`)
        .send({ purpose });

    const user = await sign(USER_ID, 'USER', 'IDENTITY_DOCUMENT');
    expect(user.status).toBe(200);
    expect(user.body.data).toMatchObject({
      cloudName: 'demo',
      apiKey: 'key',
      type: 'authenticated',
      allowedFormats: 'jpg,jpeg,png,webp',
    });
    // Server-chosen public_id bound to the uploader.
    expect(user.body.data.publicId).toMatch(new RegExp(`^toyflow/identity/${USER_ID}/[a-f0-9]+$`));
    expect(user.body.data.fields).toMatchObject({
      public_id: user.body.data.publicId,
      overwrite: 'false',
      api_key: 'key',
    });
    expect(user.body.data.signature).toMatch(/^[a-f0-9]{40}$/);

    expect((await sign(ADMIN_ID, 'ADMIN', 'HANDOVER_PHOTO')).status).toBe(200);
    expect((await sign(USER_ID, 'USER', 'ANY_FOLDER')).status).toBe(400);
  });

  it('answers 503 without Cloudinary credentials', async () => {
    const { app, token } = await loadApp({
      NODE_ENV: 'test',
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: '',
    });
    const response = await request(app)
      .post('/api/v1/uploads/signature')
      .set('Authorization', `Bearer ${token(USER_ID, 'USER')}`)
      .send({ purpose: 'TOY_PHOTO' });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('UPLOAD_NOT_CONFIGURED');
  });
});

describe('API docs', () => {
  it('serve the OpenAPI document with the bearer scheme and the registered paths', async () => {
    const { app } = await loadApp({ NODE_ENV: 'test' });
    const json = await request(app).get('/api/v1/docs/json');
    expect(json.status).toBe(200);
    expect(json.body.openapi).toBe('3.0.3');
    expect(Object.keys(json.body.components.securitySchemes)).toEqual(['bearerAuth']);
    expect(json.body.paths['/api/v1/uploads/signature']).toBeDefined();
    expect(json.body.paths['/api/v1/health']).toBeDefined();
    expect(json.body.components.schemas.ApiErrorResponse).toBeDefined();

    const ui = await request(app).get('/api/v1/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger');
  });

  it('are enabled outside production only', async () => {
    const load = async (variables: Record<string, string>) => {
      vi.resetModules();
      for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value);
      return (await import('../../src/config/feature-env.js')).featureEnv.docsEnabled;
    };
    expect(await load({ NODE_ENV: 'test' })).toBe(true);
    expect(await load({ NODE_ENV: 'test', API_DOCS_ENABLED: 'false' })).toBe(false);
    expect(await load({ NODE_ENV: 'production', API_DOCS_ENABLED: 'true' })).toBe(false);
  });
});

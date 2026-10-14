import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useTestDatabase } from '../database/helpers.js';

const ADMIN_ID = '67098e1b34e12c001a123456';
const USER_ID = '67098e1b34e12c001a123457';
const LOCKED_ID = '67098e1b34e12c001a123458';
const UNKNOWN_ID = '67098e1b34e12c001a123459';

useTestDatabase();

// Development auth reads the caller from the users collection (raw inserts: the models are
// recompiled by every loadApp).
beforeAll(async () => {
  const user = (id: string, role: string, status = 'ACTIVE') => ({
    _id: new Types.ObjectId(id),
    phone: `+849100${id.slice(-5)}`,
    email: `${id}@example.com`,
    passwordHash: 'x',
    fullName: role,
    role,
    status,
    identityStatus: 'UNVERIFIED',
  });
  await mongoose.connection
    .collection('users')
    .insertMany([
      user(ADMIN_ID, 'ADMIN'),
      user(USER_ID, 'USER'),
      user(LOCKED_ID, 'USER', 'LOCKED'),
    ]);
});

// env is read once when config/env.ts is imported, so each case loads a fresh app.
const loadApp = async (variables: Record<string, string>) => {
  vi.resetModules();
  // The app now mounts the feature routers, which compile the Mongoose models; mongoose itself is
  // not reset with the modules, so drop the compiled models before loading a fresh app.
  const { default: mongoose } = await import('mongoose');
  for (const name of mongoose.modelNames()) mongoose.deleteModel(name);
  for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value);
  const { createApp } = await import('../../src/app/create-app.js');
  return createApp();
};

afterEach(() => {
  vi.unstubAllEnvs();
});

// The role comes from the database, so the caller is picked by role.
const signUpload = (app: Awaited<ReturnType<typeof loadApp>>, role: string, purpose: string) =>
  request(app)
    .post('/api/v1/uploads/signature')
    .set('x-dev-user-id', role === 'ADMIN' ? ADMIN_ID : USER_ID)
    .send({ purpose });

describe('development auth header', () => {
  it('are ignored unless ALLOW_DEV_AUTH=true', async () => {
    const app = await loadApp({ NODE_ENV: 'development', ALLOW_DEV_AUTH: 'false' });
    const response = await signUpload(app, 'ADMIN', 'TOY_PHOTO');
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('are refused outside development and test even with the flag', async () => {
    for (const nodeEnv of ['production', 'staging', '']) {
      await expect(loadApp({ NODE_ENV: nodeEnv, ALLOW_DEV_AUTH: 'true' })).rejects.toThrow(
        /ALLOW_DEV_AUTH/,
      );
    }
  });

  it('take the role from the users collection and refuse unknown or locked users', async () => {
    const app = await loadApp({
      NODE_ENV: 'test',
      ALLOW_DEV_AUTH: 'true',
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret',
    });
    const as = (id: string) =>
      request(app)
        .post('/api/v1/uploads/signature')
        .set('x-dev-user-id', id)
        .set('x-dev-role', 'ADMIN')
        .send({ purpose: 'ORGANIZATION_LOGO' });
    // The x-dev-role header is ignored: a USER stays a USER.
    expect((await as(USER_ID)).status).toBe(403);
    expect((await as(UNKNOWN_ID)).status).toBe(401);
    const locked = await as(LOCKED_ID);
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('identify the caller when enabled, and roles are checked', async () => {
    const app = await loadApp({
      NODE_ENV: 'test',
      ALLOW_DEV_AUTH: 'true',
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret',
    });

    const user = await signUpload(app, 'USER', 'IDENTITY_DOCUMENT');
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

    const logo = await signUpload(app, 'USER', 'ORGANIZATION_LOGO');
    expect(logo.status).toBe(403);
    expect((await signUpload(app, 'ADMIN', 'ORGANIZATION_LOGO')).status).toBe(200);

    const invalid = await signUpload(app, 'USER', 'ANY_FOLDER');
    expect(invalid.status).toBe(400);
  });

  it('upload signing answers 503 without Cloudinary credentials', async () => {
    const app = await loadApp({
      NODE_ENV: 'test',
      ALLOW_DEV_AUTH: 'true',
      CLOUDINARY_CLOUD_NAME: '',
      CLOUDINARY_API_KEY: '',
      CLOUDINARY_API_SECRET: '',
    });
    const response = await signUpload(app, 'USER', 'TOY_PHOTO');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('UPLOAD_NOT_CONFIGURED');
  });
});

describe('API docs', () => {
  it('serve the OpenAPI document with both dev headers and the registered paths', async () => {
    const app = await loadApp({ NODE_ENV: 'test', API_DOCS_ENABLED: 'true' });
    const json = await request(app).get('/api/docs/json');
    expect(json.status).toBe(200);
    expect(json.body.openapi).toBe('3.0.3');
    expect(Object.keys(json.body.components.securitySchemes)).toEqual(['devUserId']);
    expect(json.body.paths['/api/v1/uploads/signature']).toBeDefined();
    expect(json.body.paths['/api/v1/health']).toBeDefined();
    expect(json.body.components.schemas.ApiErrorResponse).toBeDefined();

    const ui = await request(app).get('/api/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger');
  });

  it('are never mounted in production', async () => {
    const app = await loadApp({ NODE_ENV: 'production', API_DOCS_ENABLED: 'true' });
    expect((await request(app).get('/api/docs/json')).status).toBe(404);
  });

  it('are not mounted when disabled', async () => {
    const app = await loadApp({ NODE_ENV: 'test', API_DOCS_ENABLED: 'false' });
    const response = await request(app).get('/api/docs/json');
    expect(response.status).toBe(404);
  });
});

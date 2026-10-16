import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useTestDatabase } from '../database/helpers.js';

const SECRET = 'test_access_secret';
const ADMIN_ID = '67098e1b34e12c001a223456';
const USER_ID = '67098e1b34e12c001a223457';
const LOCKED_ID = '67098e1b34e12c001a223458';
const UNKNOWN_ID = '67098e1b34e12c001a223459';
const PASSWORD = 'Secret#123';
const ADMIN_LIST = '/api/v1/admin/categories';

useTestDatabase();

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const user = (id: string, role: string, status = 'ACTIVE') => ({
    _id: new Types.ObjectId(id),
    phone: `+849200${id.slice(-5)}`,
    email: `${id}@example.com`,
    passwordHash,
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
      user(LOCKED_ID, 'ADMIN', 'LOCKED'),
    ]);
});

// env is read once when config/env.ts is imported, so each case loads a fresh app.
const loadApp = async (variables: Record<string, string> = {}) => {
  vi.resetModules();
  const { default: mongoose } = await import('mongoose');
  for (const name of mongoose.modelNames()) mongoose.deleteModel(name);
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('ALLOW_DEV_AUTH', 'false');
  vi.stubEnv('JWT_ACCESS_SECRET', SECRET);
  vi.stubEnv('JWT_REFRESH_SECRET', 'test_refresh_secret');
  for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value);
  const { createApp } = await import('../../src/app/create-app.js');
  return createApp();
};

afterEach(() => {
  vi.unstubAllEnvs();
});

const decode = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;

describe('JWT access token', () => {
  it('from /auth/login carries the role claim and opens the admin routes', async () => {
    const app = await loadApp();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: `${ADMIN_ID}@example.com`, password: PASSWORD });
    expect(login.status).toBe(200);
    const { accessToken } = login.body.data.tokens as { accessToken: string };
    expect(decode(accessToken)).toMatchObject({ userId: ADMIN_ID, role: 'ADMIN' });

    const list = await request(app).get(ADMIN_LIST).set('Authorization', `Bearer ${accessToken}`);
    expect(list.status).toBe(200);
  });

  it('of a USER is forbidden on admin routes', async () => {
    const app = await loadApp();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: `${USER_ID}@example.com`, password: PASSWORD });
    const token = (login.body.data.tokens as { accessToken: string }).accessToken;
    const response = await request(app).get(ADMIN_LIST).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('takes the role from the database, not from the token', async () => {
    const app = await loadApp();
    const token = jwt.sign({ userId: USER_ID, role: 'ADMIN' }, SECRET, { expiresIn: '5m' });
    const response = await request(app).get(ADMIN_LIST).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('refuses missing, invalid, expired, foreign and special-purpose tokens', async () => {
    const app = await loadApp();
    expect((await request(app).get(ADMIN_LIST)).status).toBe(401);

    const bad = [
      'not-a-token',
      jwt.sign({ userId: ADMIN_ID, role: 'ADMIN' }, 'other_secret'),
      jwt.sign({ userId: ADMIN_ID, role: 'ADMIN' }, SECRET, { expiresIn: -10 }),
      jwt.sign({ userId: UNKNOWN_ID, role: 'ADMIN' }, SECRET),
      jwt.sign({ userId: ADMIN_ID, email: 'x', type: 'google_2fa_pending' }, SECRET),
    ];
    for (const token of bad) {
      const response = await request(app).get(ADMIN_LIST).set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'INVALID_ACCESS_TOKEN' },
      });
    }
  });

  it('of a locked account is refused', async () => {
    const app = await loadApp();
    const token = jwt.sign({ userId: LOCKED_ID, role: 'ADMIN' }, SECRET);
    const response = await request(app).get(ADMIN_LIST).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'ACCOUNT_LOCKED' } });
  });

  it('accepts the `sub` claim', async () => {
    const app = await loadApp();
    const token = jwt.sign({ sub: ADMIN_ID, role: 'ADMIN' }, SECRET);
    const response = await request(app).get(ADMIN_LIST).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
  });
});

describe('JWT secrets', () => {
  it('are required in production', async () => {
    await expect(
      loadApp({ NODE_ENV: 'production', JWT_ACCESS_SECRET: '', JWT_REFRESH_SECRET: '' }),
    ).rejects.toThrow(/JWT_ACCESS_SECRET/);
    await expect(
      loadApp({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'a', JWT_REFRESH_SECRET: '' }),
    ).rejects.toThrow(/JWT_REFRESH_SECRET/);
  });
});

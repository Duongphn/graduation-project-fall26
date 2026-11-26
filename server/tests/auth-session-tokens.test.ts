import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { RefreshToken, User } from '../src/models/index.js';
import { useTestDatabase } from './support/test-database.js';

// R05 TC-SEC-009/010/011/013: token lifetimes, hashed refresh tokens, signed logout, no default secrets.
useTestDatabase();

const mailer = { sendOtpEmail: vi.fn(async () => undefined), sendResetPasswordEmail: vi.fn(async () => undefined) };
const app = createApp({ authMailer: mailer });
const PASSWORD = 'secret123';
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

let passwordHash: string;
let userId: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), RefreshToken.deleteMany({})]);
  const user = await User.create({
    email: 'an@example.com',
    phone: '0912345678',
    passwordHash,
    fullName: 'Nguyen Van An',
    role: 'USER',
    status: 'ACTIVE',
  });
  userId = String(user._id);
});

const signIn = async () => {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ identifier: 'an@example.com', password: PASSWORD });
  expect(response.status).toBe(200);
  return response.body.data.tokens as { accessToken: string; refreshToken: string };
};

describe('token lifetimes (TC-SEC-009)', () => {
  it('issues a 1-hour access token and a 30-day refresh token whose DB record expires with it', async () => {
    const { accessToken, refreshToken } = await signIn();
    const access = jwt.decode(accessToken) as { iat: number; exp: number };
    const refresh = jwt.decode(refreshToken) as { iat: number; exp: number };
    expect(access.exp - access.iat).toBe(60 * 60);
    expect(refresh.exp - refresh.iat).toBe(30 * 24 * 60 * 60);

    const stored = await RefreshToken.findOne({ userId });
    expect(stored?.expiresAt.getTime()).toBe(refresh.exp * 1000);
  });
});

describe('hashed refresh tokens (TC-SEC-010)', () => {
  it('stores only the SHA-256 of the refresh token, and rotation still refuses the old token', async () => {
    const { refreshToken } = await signIn();
    expect(await RefreshToken.exists({ token: refreshToken })).toBeNull();
    expect(await RefreshToken.exists({ token: sha256(refreshToken) })).not.toBeNull();

    const rotated = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken });
    expect(rotated.status).toBe(200);
    const next = rotated.body.data.refreshToken as string;
    expect(await RefreshToken.exists({ token: sha256(next) })).not.toBeNull();
    expect(await RefreshToken.countDocuments({ userId })).toBe(1);

    const reused = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken });
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('revokes the token on single-device logout and stays idempotent for unknown tokens', async () => {
    const { refreshToken } = await signIn();
    expect((await request(app).post('/api/v1/auth/logout').send({ refreshToken })).status).toBe(200);
    expect(await RefreshToken.countDocuments({ userId })).toBe(0);
    expect((await request(app).post('/api/v1/auth/logout').send({ refreshToken })).status).toBe(200);

    const refreshed = await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken });
    expect(refreshed.status).toBe(401);
  });
});

describe('logout from all devices (TC-SEC-011)', () => {
  it('refuses unsigned, foreign-key or unknown tokens and deletes nothing', async () => {
    await signIn();
    await signIn();

    const unsigned = jwt.sign({ userId }, '', { algorithm: 'none' } as jwt.SignOptions);
    const foreign = jwt.sign({ userId, jti: 'x' }, 'attacker_secret', { expiresIn: '1h' });
    const unknown = jwt.sign({ userId, jti: 'never-stored' }, env.jwtRefreshSecret, { expiresIn: '1h' });
    // Even a valid access token of the user is not a refresh token.
    const access = jwt.sign({ userId, role: 'USER' }, env.jwtAccessSecret, { expiresIn: '1h' });

    for (const refreshToken of [unsigned, foreign, unknown, access, 'not-a-jwt']) {
      const response = await request(app).post('/api/v1/auth/logout').send({ refreshToken, allDevices: true });
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    }
    expect(await RefreshToken.countDocuments({ userId })).toBe(2);
  });

  it('ends every session of the user with a stored refresh token', async () => {
    const first = await signIn();
    await signIn();
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: first.refreshToken, allDevices: true });
    expect(response.status).toBe(200);
    expect(await RefreshToken.countDocuments({ userId })).toBe(0);
  });
});

describe('JWT secrets (TC-SEC-013)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])('stops start-up naming %s when it is missing', async (name) => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(name, '');
    const fresh = await import('../src/config/env.js');
    expect(() => fresh.assertRequiredSecrets()).toThrow(name);
    const read = () => (name === 'JWT_ACCESS_SECRET' ? fresh.env.jwtAccessSecret : fresh.env.jwtRefreshSecret);
    expect(read).toThrow(name);
  });

  it('keeps no default secret that could sign tokens', async () => {
    vi.resetModules();
    vi.stubEnv('JWT_ACCESS_SECRET', 'configured_access');
    vi.stubEnv('JWT_REFRESH_SECRET', 'configured_refresh');
    const fresh = await import('../src/config/env.js');
    expect(() => fresh.assertRequiredSecrets()).not.toThrow();
    expect(fresh.env.jwtAccessSecret).toBe('configured_access');
    expect(fresh.env.jwtRefreshSecret).toBe('configured_refresh');
  });
});

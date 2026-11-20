import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorHandler } from '../../src/middlewares/error-handler.js';
import { createRateLimiter } from '../../src/middlewares/rate-limit.js';

// R05 TC-SEC-032: bursts from one client get 429 with Retry-After; other clients are not affected.
const build = (now: () => number) => {
  const app = express();
  app.set('trust proxy', 1);
  app.post('/api/v1/auth/*path', createRateLimiter({ windowMs: 60_000, max: 10, now }));
  app.post('/api/v1/auth/*path', (_req, res) => res.status(401).json({ error: { code: 'INVALID_CREDENTIALS' } }));
  app.use(errorHandler);
  return app;
};

describe('auth rate limit (TC-SEC-032)', () => {
  afterEach(() => vi.useRealTimers());

  it('answers 429 with Retry-After after 10 requests per minute for one action and one IP', async () => {
    let time = 1_000_000;
    const app = build(() => time);
    const ip = { 'X-Forwarded-For': '203.0.113.5' };
    for (let i = 0; i < 10; i++) expect((await request(app).post('/api/v1/auth/login').set(ip)).status).toBe(401);
    const blocked = await request(app).post('/api/v1/auth/login').set(ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // Another client and another action keep their own budget.
    expect((await request(app).post('/api/v1/auth/login').set({ 'X-Forwarded-For': '198.51.100.7' })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/forgot-password').set(ip)).status).toBe(401);

    // After the window the client can try again.
    time += 60_001;
    expect((await request(app).post('/api/v1/auth/login').set(ip)).status).toBe(401);
  });

  it('can be turned off', async () => {
    const app = express();
    app.post('/x', createRateLimiter({ windowMs: 60_000, max: 1, enabled: false }), (_req, res) => res.sendStatus(204));
    for (let i = 0; i < 5; i++) expect((await request(app).post('/x')).status).toBe(204);
  });
});

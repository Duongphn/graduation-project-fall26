import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { env } from '../src/config/env.js';
import { authenticate } from '../src/shared/middleware/authenticate.js';
import { errorHandler } from '../src/shared/middleware/error-handler.js';
import { requireActor } from '../src/shared/middleware/require-actor.js';
import { requireAdmin } from '../src/shared/middleware/require-admin.js';

function createTestApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/v1/test/authenticated', authenticate, (req, res) => {
    res.json({ success: true, auth: req.auth });
  });

  app.post('/api/v1/test/authenticated', authenticate, (req, res) => {
    res.json({ success: true, auth: req.auth, body: req.body });
  });

  app.get('/api/v1/test/user-route', authenticate, requireActor, (req, res) => {
    res.json({ success: true, auth: req.auth });
  });

  app.get('/api/v1/test/admin-route', authenticate, requireAdmin, (req, res) => {
    res.json({ success: true, auth: req.auth });
  });

  app.post('/api/v1/test/admin-route', authenticate, requireAdmin, (req, res) => {
    res.json({ success: true, auth: req.auth, body: req.body });
  });

  app.use(errorHandler);
  return app;
}

function createToken(
  payload: Record<string, unknown>,
  options?: { secret?: string; expiresIn?: string | number }
): string {
  const secret = options?.secret ?? env.jwtAccessSecret;
  if (options?.expiresIn !== undefined) {
    return jwt.sign(payload, secret, { expiresIn: options.expiresIn } as jwt.SignOptions);
  }
  return jwt.sign(payload, secret);
}

describe('Auth and Actor Middleware', () => {
  const validUserId = new mongoose.Types.ObjectId().toString();
  const validAdminId = new mongoose.Types.ObjectId().toString();

  describe('authenticate middleware', () => {
    it('rejects requests missing the Authorization header with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/v1/test/authenticated');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects requests with malformed Authorization header (non-Bearer) with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/test/authenticated')
        .set('Authorization', 'Basic dXNlcjpwYXNz');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects requests with empty Bearer token with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/test/authenticated')
        .set('Authorization', 'Bearer ');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects invalid or tampered tokens with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const res = await request(app)
        .get('/api/v1/test/authenticated')
        .set('Authorization', 'Bearer invalid.token.value');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects tokens signed with a different secret with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const wrongSecretToken = createToken(
        { userId: validUserId, role: 'USER' },
        { secret: 'wrong_secret' }
      );

      const res = await request(app)
        .get('/api/v1/test/authenticated')
        .set('Authorization', `Bearer ${wrongSecretToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects expired tokens with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const expiredToken = createToken(
        { userId: validUserId, role: 'USER' },
        { expiresIn: -10 }
      );

      const res = await request(app)
        .get('/api/v1/test/authenticated')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects tokens with missing userId with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const token = createToken({ email: 'user@example.com', role: 'USER' });

      const res = await request(app)
        .get('/api/v1/test/authenticated')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects tokens with invalid ObjectId userId with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const token = createToken({ userId: 'not-an-object-id', role: 'USER' });

      const res = await request(app)
        .get('/api/v1/test/authenticated')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects tokens with unsupported role with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const token = createToken({ userId: validUserId, role: 'GUEST' });

      const res = await request(app)
        .get('/api/v1/test/authenticated')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('populates req.auth with userId and actorType USER for valid USER token', async () => {
      const app = createTestApp();
      const token = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .get('/api/v1/test/authenticated')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.auth).toEqual({
        userId: validUserId,
        actorType: 'USER',
      });
    });

    it('populates req.auth with userId and actorType ADMIN for valid ADMIN token', async () => {
      const app = createTestApp();
      const token = createToken({ userId: validAdminId, role: 'ADMIN' });

      const res = await request(app)
        .get('/api/v1/test/authenticated')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.auth).toEqual({
        userId: validAdminId,
        actorType: 'ADMIN',
      });
    });

    it('ignores roles supplied by request data and derives actorType solely from JWT', async () => {
      const app = createTestApp();
      const userToken = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .post('/api/v1/test/authenticated')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-role', 'ADMIN')
        .send({ role: 'ADMIN', actorType: 'ADMIN' });

      expect(res.status).toBe(200);
      expect(res.body.auth).toEqual({
        userId: validUserId,
        actorType: 'USER',
      });
    });
  });

  describe('requireActor and requireAdmin access control', () => {
    it('permits authenticated USER on user routes', async () => {
      const app = createTestApp();
      const userToken = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .get('/api/v1/test/user-route')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.auth.actorType).toBe('USER');
    });

    it('permits authenticated ADMIN on admin routes', async () => {
      const app = createTestApp();
      const adminToken = createToken({ userId: validAdminId, role: 'ADMIN' });

      const res = await request(app)
        .get('/api/v1/test/admin-route')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.auth.actorType).toBe('ADMIN');
    });

    it('denies authenticated USER on admin routes with 403 FORBIDDEN', async () => {
      const app = createTestApp();
      const userToken = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .get('/api/v1/test/admin-route')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('denies authenticated USER on admin routes even when body claims role ADMIN', async () => {
      const app = createTestApp();
      const userToken = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .post('/api/v1/test/admin-route')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('denies unauthenticated request on admin routes with 401 UNAUTHORIZED', async () => {
      const app = createTestApp();
      const res = await request(app).get('/api/v1/test/admin-route');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('requireAdmin middleware standalone behavior', () => {
    it('returns 401 UNAUTHORIZED if req.auth is missing', async () => {
      const app = express();
      app.get('/standalone-admin', requireAdmin, (_req, res) => {
        res.json({ ok: true });
      });
      app.use(errorHandler);

      const res = await request(app).get('/standalone-admin');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 UNAUTHORIZED if req.auth.userId is invalid ObjectId', async () => {
      const app = express();
      app.use((req, _res, next) => {
        req.auth = { userId: 'invalid', actorType: 'ADMIN' };
        next();
      });
      app.get('/standalone-admin', requireAdmin, (_req, res) => {
        res.json({ ok: true });
      });
      app.use(errorHandler);

      const res = await request(app).get('/standalone-admin');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN if req.auth.actorType is USER', async () => {
      const app = express();
      app.use((req, _res, next) => {
        req.auth = { userId: validUserId, actorType: 'USER' };
        next();
      });
      app.get('/standalone-admin', requireAdmin, (_req, res) => {
        res.json({ ok: true });
      });
      app.use(errorHandler);

      const res = await request(app).get('/standalone-admin');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});

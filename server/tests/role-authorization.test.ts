import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { env } from '../src/config/env.js';
import { optionalAuth } from '../src/middlewares/optional-auth.js';
import {
  requireAuth,
  requireRoles,
  requireUser,
  requireGuest,
} from '../src/middlewares/require-roles.js';
import { errorHandler } from '../src/middlewares/error-handler.js';

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

describe('JWT Authentication & Role-Based Authorization', () => {
  const validUserId = new mongoose.Types.ObjectId().toString();
  const validAdminId = new mongoose.Types.ObjectId().toString();

  describe('optionalAuth Middleware', () => {
    function createOptionalAuthApp() {
      const app = express();
      app.use(express.json());

      app.get('/api/v1/public/content', optionalAuth, (req, res) => {
        if (!req.auth) {
          return res.json({ role: 'GUEST', message: 'Hello, Guest!' });
        }
        res.json({
          role: req.auth.actorType,
          userId: req.auth.userId,
          message: `Hello, ${req.auth.actorType}!`,
        });
      });

      app.use(errorHandler);
      return app;
    }

    it('permits Guest without Authorization header (req.auth is undefined)', async () => {
      const app = createOptionalAuthApp();
      const res = await request(app).get('/api/v1/public/content');

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('GUEST');
      expect(res.body.message).toBe('Hello, Guest!');
    });

    it('identifies authenticated USER when valid token is supplied', async () => {
      const app = createOptionalAuthApp();
      const token = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .get('/api/v1/public/content')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('USER');
      expect(res.body.userId).toBe(validUserId);
    });

    it('identifies authenticated ADMIN when valid token is supplied', async () => {
      const app = createOptionalAuthApp();
      const token = createToken({ userId: validAdminId, role: 'ADMIN' });

      const res = await request(app)
        .get('/api/v1/public/content')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('ADMIN');
      expect(res.body.userId).toBe(validAdminId);
    });

    it('rejects expired token even on optional route with 401 UNAUTHORIZED', async () => {
      const app = createOptionalAuthApp();
      const expiredToken = createToken(
        { userId: validUserId, role: 'USER' },
        { expiresIn: -10 }
      );

      const res = await request(app)
        .get('/api/v1/public/content')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects tampered token on optional route with 401 UNAUTHORIZED', async () => {
      const app = createOptionalAuthApp();
      const res = await request(app)
        .get('/api/v1/public/content')
        .set('Authorization', 'Bearer invalid.tampered.token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects malformed authorization header with 401 UNAUTHORIZED', async () => {
      const app = createOptionalAuthApp();
      const res = await request(app)
        .get('/api/v1/public/content')
        .set('Authorization', 'Basic 123456');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('requireAuth Middleware', () => {
    function createRequireAuthApp() {
      const app = express();
      app.use(express.json());

      app.get('/api/v1/member-only', optionalAuth, requireAuth, (req, res) => {
        res.json({ success: true, actorType: req.auth?.actorType });
      });

      app.use(errorHandler);
      return app;
    }

    it('denies unauthenticated Guest with 401 UNAUTHORIZED', async () => {
      const app = createRequireAuthApp();
      const res = await request(app).get('/api/v1/member-only');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('permits authenticated USER', async () => {
      const app = createRequireAuthApp();
      const token = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .get('/api/v1/member-only')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.actorType).toBe('USER');
    });

    it('permits authenticated ADMIN', async () => {
      const app = createRequireAuthApp();
      const token = createToken({ userId: validAdminId, role: 'ADMIN' });

      const res = await request(app)
        .get('/api/v1/member-only')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.actorType).toBe('ADMIN');
    });
  });

  describe('requireRoles Middleware', () => {
    function createRbacApp() {
      const app = express();
      app.use(express.json());

      // Route chỉ cho Admin
      app.get('/api/v1/admin/dashboard', optionalAuth, requireRoles('ADMIN'), (req, res) => {
        res.json({ success: true, message: 'Welcome Admin' });
      });

      // Route chỉ cho User thông thường
      app.get('/api/v1/user/workspace', optionalAuth, requireUser, (req, res) => {
        res.json({ success: true, message: 'Welcome User' });
      });

      // Route cho cả User và Admin
      app.get('/api/v1/shared/feature', optionalAuth, requireRoles('USER', 'ADMIN'), (req, res) => {
        res.json({ success: true, message: 'Welcome Member' });
      });

      app.use(errorHandler);
      return app;
    }

    it('denies Guest on admin route with 401 UNAUTHORIZED', async () => {
      const app = createRbacApp();
      const res = await request(app).get('/api/v1/admin/dashboard');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('denies USER on admin route with 403 FORBIDDEN', async () => {
      const app = createRbacApp();
      const userToken = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('permits ADMIN on admin route with 200 OK', async () => {
      const app = createRbacApp();
      const adminToken = createToken({ userId: validAdminId, role: 'ADMIN' });

      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Welcome Admin');
    });

    it('denies ADMIN on user-exclusive route with 403 FORBIDDEN', async () => {
      const app = createRbacApp();
      const adminToken = createToken({ userId: validAdminId, role: 'ADMIN' });

      const res = await request(app)
        .get('/api/v1/user/workspace')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('permits both USER and ADMIN on shared feature route', async () => {
      const app = createRbacApp();
      const userToken = createToken({ userId: validUserId, role: 'USER' });
      const adminToken = createToken({ userId: validAdminId, role: 'ADMIN' });

      const resUser = await request(app)
        .get('/api/v1/shared/feature')
        .set('Authorization', `Bearer ${userToken}`);
      expect(resUser.status).toBe(200);

      const resAdmin = await request(app)
        .get('/api/v1/shared/feature')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resAdmin.status).toBe(200);
    });
  });

  describe('requireGuest Middleware', () => {
    function createGuestOnlyApp() {
      const app = express();
      app.use(express.json());

      app.post('/api/v1/auth/register', optionalAuth, requireGuest, (_req, res) => {
        res.json({ success: true, message: 'Registration permitted' });
      });

      app.use(errorHandler);
      return app;
    }

    it('permits unauthenticated Guest to access registration', async () => {
      const app = createGuestOnlyApp();
      const res = await request(app).post('/api/v1/auth/register');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('denies already authenticated USER from registration with 403 FORBIDDEN', async () => {
      const app = createGuestOnlyApp();
      const userToken = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});

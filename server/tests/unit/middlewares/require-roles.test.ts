import { describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

import {
  requireAuth,
  requireRoles,
  requireUser,
  requireGuest,
} from '../../../src/middlewares/require-roles.js';
import { AppError } from '../../../src/utils/app-error.js';

// ── Helper: tạo fake req/res/next ──
const validUserId = new mongoose.Types.ObjectId().toString();

const mockReq = (auth?: { userId: string; actorType: string }) =>
  ({ auth: auth ?? undefined }) as any;

const mockRes = () => ({}) as any;
const mockNext = () => vi.fn() as any;

// ──────────────────────────────────────────────
// requireAuth
// ──────────────────────────────────────────────
describe('requireAuth', () => {
  it('calls next() when req.auth has valid userId', () => {
    const next = mockNext();
    requireAuth(mockReq({ userId: validUserId, actorType: 'USER' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 401 when req.auth is missing', () => {
    const next = mockNext();
    requireAuth(mockReq(), mockRes(), next);

    const error = next.mock.calls[0]![0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
  });

  it('returns 401 when userId is not a valid ObjectId', () => {
    const next = mockNext();
    requireAuth(mockReq({ userId: 'bad-id', actorType: 'USER' }), mockRes(), next);
    expect((next.mock.calls[0]![0] as AppError).statusCode).toBe(401);
  });

  it('returns 401 when userId is empty string', () => {
    const next = mockNext();
    requireAuth(mockReq({ userId: '', actorType: 'USER' }), mockRes(), next);
    expect((next.mock.calls[0]![0] as AppError).statusCode).toBe(401);
  });
});

// ──────────────────────────────────────────────
// requireRoles
// ──────────────────────────────────────────────
describe('requireRoles', () => {
  it('allows USER when role list includes USER', () => {
    const middleware = requireRoles('USER');
    const next = mockNext();
    middleware(mockReq({ userId: validUserId, actorType: 'USER' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows ADMIN when role list includes ADMIN', () => {
    const middleware = requireRoles('ADMIN');
    const next = mockNext();
    middleware(mockReq({ userId: validUserId, actorType: 'ADMIN' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows USER when role list includes both USER and ADMIN', () => {
    const middleware = requireRoles('USER', 'ADMIN');
    const next = mockNext();
    middleware(mockReq({ userId: validUserId, actorType: 'USER' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 403 when USER tries to access ADMIN-only route', () => {
    const middleware = requireRoles('ADMIN');
    const next = mockNext();
    middleware(mockReq({ userId: validUserId, actorType: 'USER' }), mockRes(), next);

    const error = next.mock.calls[0]![0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.message).toContain('ADMIN');
  });

  it('returns 401 when req.auth is missing (not authenticated)', () => {
    const middleware = requireRoles('USER');
    const next = mockNext();
    middleware(mockReq(), mockRes(), next);

    expect((next.mock.calls[0]![0] as AppError).statusCode).toBe(401);
  });
});

// ──────────────────────────────────────────────
// requireUser (shortcut for requireRoles('USER'))
// ──────────────────────────────────────────────
describe('requireUser', () => {
  it('allows USER', () => {
    const next = mockNext();
    requireUser(mockReq({ userId: validUserId, actorType: 'USER' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects ADMIN (since requireUser only allows USER role)', () => {
    const next = mockNext();
    requireUser(mockReq({ userId: validUserId, actorType: 'ADMIN' }), mockRes(), next);
    expect((next.mock.calls[0]![0] as AppError).statusCode).toBe(403);
  });
});

// ──────────────────────────────────────────────
// requireGuest
// ──────────────────────────────────────────────
describe('requireGuest', () => {
  it('allows unauthenticated request (no req.auth)', () => {
    const next = mockNext();
    requireGuest(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 403 when user is already authenticated', () => {
    const next = mockNext();
    requireGuest(mockReq({ userId: validUserId, actorType: 'USER' }), mockRes(), next);

    const error = next.mock.calls[0]![0] as AppError;
    expect(error.statusCode).toBe(403);
    expect(error.message).toContain('already authenticated');
  });
});

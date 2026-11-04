import { describe, expect, it, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { authenticate } from '../../../src/middlewares/authenticate.js';
import { AppError } from '../../../src/utils/app-error.js';

// Mock jwt module
vi.mock('jsonwebtoken');

// ── Helper: tạo fake req/res/next ──
const mockReq = (authHeader?: string) =>
  ({ headers: { authorization: authHeader }, auth: undefined }) as any;

const mockRes = () => ({}) as any;

const mockNext = () => vi.fn() as any;

describe('authenticate middleware', () => {
  const validUserId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Missing / malformed header ──
  it('returns 401 when no Authorization header is present', () => {
    const next = mockNext();
    authenticate(mockReq(), mockRes(), next);

    expect(next).toHaveBeenCalledOnce();
    const error = next.mock.calls[0]![0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for header without "Bearer " prefix', () => {
    const next = mockNext();
    authenticate(mockReq('Basic abc123'), mockRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect((next.mock.calls[0]![0] as AppError).statusCode).toBe(401);
  });

  it('returns 401 for "Bearer" with only whitespace as token', () => {
    const next = mockNext();
    authenticate(mockReq('Bearer    '), mockRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect((next.mock.calls[0]![0] as AppError).statusCode).toBe(401);
  });

  // ── JWT verification errors ──
  it('returns 401 with "expired" message when token is expired', () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new jwt.TokenExpiredError('jwt expired', new Date());
    });

    const next = mockNext();
    authenticate(mockReq('Bearer some.expired.token'), mockRes(), next);

    const error = next.mock.calls[0]![0] as AppError;
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('expired');
  });

  it('returns 401 with "Invalid token" when token is malformed', () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new jwt.JsonWebTokenError('invalid signature');
    });

    const next = mockNext();
    authenticate(mockReq('Bearer bad.token'), mockRes(), next);

    const error = next.mock.calls[0]![0] as AppError;
    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('Invalid token');
  });

  // ── Invalid payload ──
  it('returns 401 when token payload has invalid userId (not ObjectId)', () => {
    vi.mocked(jwt.verify).mockReturnValue({ userId: 'not-objectid', role: 'USER' } as any);

    const next = mockNext();
    authenticate(mockReq('Bearer valid.token'), mockRes(), next);

    expect((next.mock.calls[0]![0] as AppError).message).toContain('Invalid user');
  });

  it('returns 401 when token payload has no userId', () => {
    vi.mocked(jwt.verify).mockReturnValue({ role: 'USER' } as any);

    const next = mockNext();
    authenticate(mockReq('Bearer valid.token'), mockRes(), next);

    expect((next.mock.calls[0]![0] as AppError).statusCode).toBe(401);
  });

  it('returns 401 when role is not USER or ADMIN', () => {
    vi.mocked(jwt.verify).mockReturnValue({ userId: validUserId, role: 'SUPER_ADMIN' } as any);

    const next = mockNext();
    authenticate(mockReq('Bearer valid.token'), mockRes(), next);

    expect((next.mock.calls[0]![0] as AppError).message).toContain('Invalid role');
  });

  // ── Happy path ──
  it('sets req.auth and calls next() without error for valid USER token', () => {
    vi.mocked(jwt.verify).mockReturnValue({ userId: validUserId, role: 'USER' } as any);

    const req = mockReq('Bearer valid.user.token');
    const next = mockNext();
    authenticate(req, mockRes(), next);

    // next() được gọi KHÔNG có argument (không có error)
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({
      userId: validUserId,
      actorType: 'USER',
    });
  });

  it('sets req.auth with ADMIN role for valid ADMIN token', () => {
    vi.mocked(jwt.verify).mockReturnValue({ userId: validUserId, role: 'ADMIN' } as any);

    const req = mockReq('Bearer valid.admin.token');
    const next = mockNext();
    authenticate(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({
      userId: validUserId,
      actorType: 'ADMIN',
    });
  });
});

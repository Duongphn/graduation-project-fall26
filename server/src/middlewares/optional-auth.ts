import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import type { RequestActorType } from '../types/request-actor.js';
import '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';

interface AccessTokenPayload {
  userId?: unknown;
  role?: unknown;
  email?: unknown;
}

/**
 * Middleware xác thực tùy chọn (Optional Authentication):
 * - Nếu không có header Authorization: Cho qua như một Khách (Guest), req.auth là undefined.
 * - Nếu có header Authorization nhưng định dạng sai hoặc token hết hạn: Trả về lỗi 401.
 * - Nếu token hợp lệ: Giải mã và gán thông tin định danh vào req.auth.
 */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
  }

  const rawToken = match[1];
  if (!rawToken || !rawToken.trim()) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
  }

  const token = rawToken.trim();

  let decoded: AccessTokenPayload;
  try {
    const verified = jwt.verify(token, env.jwtAccessSecret);
    if (typeof verified !== 'object' || verified === null) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Invalid token payload.'));
    }
    decoded = verified as AccessTokenPayload;
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Token has expired.'));
    }
    return next(new AppError(401, 'UNAUTHORIZED', 'Invalid token.'));
  }

  const { userId, role } = decoded;

  if (
    !userId ||
    typeof userId !== 'string' ||
    !mongoose.Types.ObjectId.isValid(userId)
  ) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Invalid user in token.'));
  }

  if (role !== 'USER' && role !== 'ADMIN') {
    return next(new AppError(401, 'UNAUTHORIZED', 'Invalid role in token.'));
  }

  const validRole = role as RequestActorType;
  req.auth = {
    userId,
    actorType: validRole,
    role: validRole,
    ...(typeof decoded.email === 'string' ? { email: decoded.email } : {}),
  };

  next();
};

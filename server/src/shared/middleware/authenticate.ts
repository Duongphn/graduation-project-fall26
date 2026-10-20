import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { env } from '../../config/env.js';
import '../contracts/request-actor.js';
import { AppError } from '../errors/app-error.js';

interface AccessTokenPayload {
  userId?: unknown;
  role?: unknown;
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
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

  // Same shape as auth-placeholder (RequestAuth { userId, role }).
  req.auth = {
    userId,
    role,
  };

  next();
};

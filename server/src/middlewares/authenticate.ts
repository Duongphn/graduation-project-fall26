import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { accountLockedError, findRunningLock } from '../services/account-lock.service.js';
import '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';

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

  req.auth = {
    userId,
    actorType: role,
  };

  // UC29: an account locked by an Admin loses access at once, not when its token expires
  // (R03 IV security "Session control"). 401, so the web app drops the session and the sign-in
  // page shows the lock reason (MSG12). Skipped without a database connection.
  if (mongoose.connection.readyState !== 1) return next();
  findRunningLock(userId)
    .then((lock) => next(lock ? accountLockedError(lock, 401) : undefined))
    .catch(next);
};

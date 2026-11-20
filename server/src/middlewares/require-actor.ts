import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';

export const requireActor: RequestHandler = (req, _res, next) => {
  // Signed in, but not as a USER (e.g. an Admin): forbidden rather than unauthenticated.
  if (req.auth?.userId && req.auth.actorType && req.auth.actorType !== 'USER') {
    return next(new AppError(403, 'FORBIDDEN', 'Chức năng này chỉ dành cho tài khoản người dùng.'));
  }
  if (
    !req.auth ||
    req.auth.actorType !== 'USER' ||
    !req.auth.userId ||
    typeof req.auth.userId !== 'string' ||
    !mongoose.Types.ObjectId.isValid(req.auth.userId)
  ) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập để tiếp tục.'));
  }

  next();
};

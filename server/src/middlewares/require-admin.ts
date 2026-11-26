import type { RequestHandler } from 'express';
import mongoose from 'mongoose';

import '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (
    !req.auth ||
    !req.auth.userId ||
    typeof req.auth.userId !== 'string' ||
    !mongoose.Types.ObjectId.isValid(req.auth.userId)
  ) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập để tiếp tục.'));
  }

  if (req.auth.actorType !== 'ADMIN') {
    return next(new AppError(403, 'FORBIDDEN', 'Chức năng này chỉ dành cho Admin.'));
  }

  next();
};

import type { RequestHandler } from 'express';
import mongoose from 'mongoose';

import '../contracts/request-actor.js';
import { AppError } from '../errors/app-error.js';

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (
    !req.auth ||
    !req.auth.userId ||
    typeof req.auth.userId !== 'string' ||
    !mongoose.Types.ObjectId.isValid(req.auth.userId)
  ) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
  }

  if (req.auth.role !== 'ADMIN') {
    return next(new AppError(403, 'FORBIDDEN', 'Admin access required.'));
  }

  next();
};

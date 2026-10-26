import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';

export const requireActor: RequestHandler = (req, _res, next) => {
  if (
    !req.auth ||
    req.auth.actorType !== 'USER' ||
    !req.auth.userId ||
    typeof req.auth.userId !== 'string' ||
    !mongoose.Types.ObjectId.isValid(req.auth.userId)
  ) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
  }

  next();
};

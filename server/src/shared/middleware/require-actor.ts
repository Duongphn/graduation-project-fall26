import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import '../contracts/request-actor.js';
import { AppError } from '../errors/app-error.js';

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

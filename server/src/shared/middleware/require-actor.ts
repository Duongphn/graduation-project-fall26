import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../errors/app-error.js';
import { requireUser } from './auth-placeholder.js';

const authenticationRequired = () => new AppError(401, 'UNAUTHORIZED', 'Authentication required.');

// Signs the caller in through the shared guard (requireUser), then checks the user id.
export const requireActor: RequestHandler = (req, res, next) => {
  requireUser(req, res, (error?: unknown) => {
    if (error) {
      return next(
        error instanceof AppError && error.statusCode === 401 ? authenticationRequired() : error,
      );
    }
    if (!req.auth?.userId || !mongoose.Types.ObjectId.isValid(req.auth.userId)) {
      return next(authenticationRequired());
    }
    next();
  });
};

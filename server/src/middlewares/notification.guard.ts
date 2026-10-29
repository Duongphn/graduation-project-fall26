import type { RequestHandler } from 'express';
import mongoose from 'mongoose';

import '../types/request-actor.js';
import { unauthorized } from '../utils/http-errors.js';

/**
 * Any signed-in caller, USER or ADMIN (develop's requireActor refuses Admin tokens, and Admins
 * receive notifications too). Runs after develop's `authenticate`, which sets `req.auth`.
 */
export const requireSignedIn: RequestHandler = (req, _res, next) => {
  const auth = req.auth;
  if (!auth || typeof auth.userId !== 'string' || !mongoose.Types.ObjectId.isValid(auth.userId)) {
    next(unauthorized());
    return;
  }
  next();
};

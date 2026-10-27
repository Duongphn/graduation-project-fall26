import type { RequestHandler } from 'express';

import '../../src/types/request-actor.js';

/**
 * Stand-in for develop's `authenticate` middleware in feature tests: the headers
 * x-test-user / x-test-role set `req.auth` ({ userId, actorType }) like a verified access token.
 */
export const testAuth: RequestHandler = (req, _res, next) => {
  const userId = req.header('x-test-user');
  const role = req.header('x-test-role');
  if (userId) req.auth = { userId, actorType: role === 'ADMIN' ? 'ADMIN' : 'USER' };
  next();
};

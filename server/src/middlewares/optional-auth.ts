import type { RequestHandler } from 'express';

import { authenticate } from './authenticate.js';

/**
 * For public routes that show more to a signed-in caller: runs develop's `authenticate` when an
 * Authorization header is present and treats a missing or invalid token as anonymous (never 401).
 */
export const optionalAuth: RequestHandler = (request, response, next) => {
  if (!request.headers.authorization) {
    next();
    return;
  }
  authenticate(request, response, (error?: unknown) => {
    if (error) delete request.auth;
    next();
  });
};

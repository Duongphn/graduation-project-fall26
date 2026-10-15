import type { RequestHandler } from 'express';

import { requireUser } from './auth-placeholder.js';

// The toys routes use the shared guard unchanged: same 401 code, message and envelope as every
// other route (the dev auth already checks that the id is an ObjectId).
export const requireActor: RequestHandler = requireUser;

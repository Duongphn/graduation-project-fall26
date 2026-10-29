import type { Request } from 'express';

import '../types/request-actor.js';
import type { RequestActor } from '../types/request-actor.js';
import { forbidden, unauthorized } from './http-errors.js';

// Helpers over develop's `req.auth` (set by shared/middleware/authenticate.ts, checked by
// requireActor / requireAdmin).

/** Who performs an Admin action, passed from the controller to the service and audit log. */
export interface AdminContext {
  actor: { actorType: 'ADMIN'; actorId: string };
  ipAddress?: string;
}

/** The signed-in caller, or undefined. */
export const getRequestAuth = (request: Request): RequestActor | undefined => request.auth;

/** The signed-in caller's id. Use on routes guarded by requireActor / requireAdmin. */
export const getRequestUserId = (request: Request): string => {
  const auth = getRequestAuth(request);
  if (!auth) throw unauthorized();
  return auth.userId;
};

/** The acting Admin. Use on routes guarded by requireAdmin. */
export const getAdminContext = (request: Request): AdminContext => {
  const auth = getRequestAuth(request);
  if (!auth) throw unauthorized();
  if (auth.actorType !== 'ADMIN') throw forbidden();
  return {
    actor: { actorType: 'ADMIN', actorId: auth.userId },
    ...(request.ip ? { ipAddress: request.ip } : {}),
  };
};

import type { Request } from 'express';

import { forbidden, unauthorized } from '../errors/app-error.js';
import { getRequestAuth } from '../middleware/auth-placeholder.js';

/** Who performs an Admin action, passed from the controller to the service and audit log. */
export interface AdminContext {
  actor: { actorType: 'ADMIN'; actorId: string };
  ipAddress?: string;
}

/** The acting Admin. Use on routes guarded by requireAdmin. */
export const getAdminContext = (request: Request): AdminContext => {
  const auth = getRequestAuth(request);
  if (!auth) throw unauthorized();
  if (auth.role !== 'ADMIN') throw forbidden();
  return {
    actor: { actorType: 'ADMIN', actorId: auth.userId },
    ...(request.ip ? { ipAddress: request.ip } : {}),
  };
};

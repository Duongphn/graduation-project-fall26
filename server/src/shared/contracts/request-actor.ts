import type { RequestAuth } from '../middleware/auth-placeholder.js';

export interface RequestActor {
  userId: string;
  actorType: 'USER' | 'ADMIN';
}

// `request.auth` is declared once, in shared/middleware/auth-placeholder.ts ({ userId, role }).
// The toy listing service acts on behalf of the signed-in account; it refuses ADMIN (403).
export const toRequestActor = (auth: RequestAuth): RequestActor => ({
  userId: auth.userId,
  actorType: auth.role === 'ADMIN' ? 'ADMIN' : 'USER',
});

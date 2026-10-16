import type { RequestAuth } from '../middleware/auth-placeholder.js';

export type RequestActorType = 'USER' | 'ADMIN';

export interface RequestActor {
  userId: string;
  actorType: RequestActorType;
}

// `request.auth` is declared once, in shared/middleware/auth-placeholder.ts ({ userId, role }).
// The toy listing service acts on behalf of the signed-in account.
export const toRequestActor = (auth: RequestAuth): RequestActor => ({
  userId: auth.userId,
  actorType: 'USER',
});

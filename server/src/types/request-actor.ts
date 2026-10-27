import 'express';

export type RequestActorType = 'USER' | 'ADMIN';

export interface RequestActor {
  userId: string;
  actorType: RequestActorType;
  role?: RequestActorType;
  email?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: RequestActor;
    }
  }
}

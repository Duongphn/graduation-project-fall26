import 'express';

export interface RequestActor {
  userId: string;
  actorType: 'USER';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: RequestActor;
    }
  }
}

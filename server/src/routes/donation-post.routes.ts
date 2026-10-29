import { Router, type Request, type Response } from 'express';

import type { ToyImageStorage } from '../interfaces/toy-listing.ports.js';
import { requireActor } from '../middlewares/require-actor.js';
import { toyImageUpload } from '../middlewares/upload.middleware.js';
import { createDonationPost } from '../services/donation-post.service.js';
import { getRequestUserId } from '../utils/admin-context.js';
import { sendCreated } from '../utils/response.js';

/** Router mounted at /api/v1/donation-posts, after develop's authenticate. */
export const createDonationPostsRouter = (imageStorage: ToyImageStorage): Router => {
  const router = Router();
  router.post('/', requireActor, toyImageUpload, async (request: Request, response: Response) => {
    const files = (Array.isArray(request.files) ? request.files : []) as Express.Multer.File[];
    const body = (request.body ?? {}) as Record<string, unknown>;
    sendCreated(
      response,
      await createDonationPost(imageStorage, getRequestUserId(request), body, files),
    );
  });
  return router;
};

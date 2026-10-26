import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { toyImageUpload } from '../middlewares/upload.middleware.js';
import { ToyListingController } from '../controllers/toy-listing.controller.js';
import type { ToyListingService } from '../services/toy-listing.service.js';

/**
 * Router đăng tin của /toys. `authenticate` gắn trên từng route (không phải router.use)
 * để request công khai GET /toys, /toys/showcase, /toys/:toyId… vẫn đi tiếp sang router catalog.
 */
export function createToyListingRouter(
  service: ToyListingService,
  controller: ToyListingController = new ToyListingController(service),
): Router {
  const router = Router();
  const signedIn = [authenticate, requireActor];

  router.post('/', ...signedIn, toyImageUpload, controller.create);
  router.get('/mine', ...signedIn, controller.listMine);
  router.patch('/:toyId', ...signedIn, toyImageUpload, controller.update);
  router.post('/:toyId/hide', ...signedIn, controller.hide);
  router.delete('/:toyId', ...signedIn, controller.delete);

  return router;
}

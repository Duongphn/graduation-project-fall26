import { Router } from 'express';
import { optionalAuth } from '../../shared/middleware/optional-auth.js';
import { requireActor } from '../../shared/middleware/require-actor.js';
import { toyImageUpload } from './toy-image-upload.js';
import { ToyListingController } from './toy-listing.controller.js';
import type { ToyListingService } from './toy-listing.service.js';

export function createToyListingRouter(
  service: ToyListingService,
  controller: ToyListingController = new ToyListingController(service),
): Router {
  const router = Router();

  router.post('/', optionalAuth, requireActor, toyImageUpload, controller.create);
  router.get('/mine', optionalAuth, requireActor, controller.listMine);
  router.patch('/:toyId', optionalAuth, requireActor, toyImageUpload, controller.update);
  router.post('/:toyId/hide', optionalAuth, requireActor, controller.hide);
  router.delete('/:toyId', optionalAuth, requireActor, controller.delete);

  return router;
}

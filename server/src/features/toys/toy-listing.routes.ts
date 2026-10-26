import { Router } from 'express';
import { requireActor } from '../../middlewares/require-actor.js';
import { toyImageUpload } from '../../middlewares/upload.middleware.js';
import { ToyListingController } from './toy-listing.controller.js';
import type { ToyListingService } from './toy-listing.service.js';

export function createToyListingRouter(
  service: ToyListingService,
  controller: ToyListingController = new ToyListingController(service),
): Router {
  const router = Router();

  router.post('/', requireActor, toyImageUpload, controller.create);
  router.get('/mine', requireActor, controller.listMine);
  router.patch('/:toyId', requireActor, toyImageUpload, controller.update);
  router.post('/:toyId/hide', requireActor, controller.hide);
  router.delete('/:toyId', requireActor, controller.delete);

  return router;
}

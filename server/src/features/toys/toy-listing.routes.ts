import { Router } from 'express';
import { requireActor } from '../../shared/middleware/require-actor.js';
import { toyImageUpload } from './toy-image-upload.js';
import { ToyListingController } from './toy-listing.controller.js';
import type { ToyListingService } from './toy-listing.service.js';

export function createToyListingRouter(
  service: ToyListingService,
  controller: ToyListingController = new ToyListingController(service),
): Router {
  const router = Router();

  router.use(requireActor);

  router.post('/', toyImageUpload, controller.create);
  router.get('/mine', controller.listMine);
  router.patch('/:toyId', toyImageUpload, controller.update);
  router.post('/:toyId/hide', controller.hide);
  router.delete('/:toyId', controller.delete);

  return router;
}

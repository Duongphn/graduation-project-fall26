import { Router } from 'express';
import { DisputeController } from '../controllers/dispute.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { rentalPhotoUpload } from '../middlewares/upload.middleware.js';
import { type DisputeService } from '../services/dispute.service.js';

/** Dispute routes nested under a rental order; mounted by the rental order router at `/rentals`. */
export function createRentalDisputeRouter(service: DisputeService): Router {
  const router = Router();
  const controller = new DisputeController(service);

  router.post('/:id/disputes', authenticate, requireActor, rentalPhotoUpload, controller.open);

  return router;
}

/** The caller's own disputes; mounted at `/disputes`. */
export function createDisputeRouter(service: DisputeService): Router {
  const router = Router();
  const controller = new DisputeController(service);

  router.get('/', authenticate, requireActor, controller.list);
  router.get('/:id', authenticate, requireActor, controller.getOne);
  router.post('/:id/response', authenticate, requireActor, rentalPhotoUpload, controller.respond);

  return router;
}

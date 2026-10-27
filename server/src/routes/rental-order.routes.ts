import { Router } from 'express';
import { RentalOrderController } from '../controllers/rental-order.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { rentalPhotoUpload } from '../middlewares/upload.middleware.js';
import { type RentalOrderService } from '../services/rental-order.service.js';

export function createRentalOrderRouter(service: RentalOrderService): Router {
  const router = Router();
  const controller = new RentalOrderController(service);

  router.post('/quote', authenticate, requireActor, controller.quote);
  router.post('/', authenticate, requireActor, controller.create);
  router.get('/', authenticate, requireActor, controller.list);
  router.get('/:id/history', authenticate, requireActor, controller.history);
  router.get('/:id', authenticate, requireActor, controller.get);
  router.post('/:id/accept', authenticate, requireActor, controller.accept);
  router.post('/:id/reject', authenticate, requireActor, controller.reject);
  router.post('/:id/pay', authenticate, requireActor, controller.pay);
  router.post('/:id/ship', authenticate, requireActor, rentalPhotoUpload, controller.ship);
  router.post('/:id/receive', authenticate, requireActor, rentalPhotoUpload, controller.receive);
  router.post('/:id/return', authenticate, requireActor, rentalPhotoUpload, controller.returnToy);
  router.post('/:id/settle', authenticate, requireActor, rentalPhotoUpload, controller.settle);

  return router;
}

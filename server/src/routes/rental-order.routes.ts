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
  router.get('/', authenticate, controller.list);
  router.get('/:id/history', authenticate, controller.history);
  router.get('/:id', authenticate, controller.get);
  router.post('/:id/accept', authenticate, requireActor, controller.accept);
  router.post('/:id/reject', authenticate, requireActor, controller.reject);
  router.post('/:id/cancel', authenticate, requireActor, controller.cancel);
  router.post('/:id/pay', authenticate, requireActor, controller.pay);
  router.post('/:id/ship', authenticate, requireActor, rentalPhotoUpload, controller.ship);
  router.post('/:id/receive', authenticate, requireActor, rentalPhotoUpload, controller.receive);
  router.post('/:id/return', authenticate, requireActor, rentalPhotoUpload, controller.returnToy);
  router.post('/:id/settle', authenticate, requireActor, rentalPhotoUpload, controller.settle);
  // Khiếu nại (UC17–UC18): người thuê mở, hai bên xem, bên bị khiếu nại phản hồi một lần
  router.post('/:id/complaints', authenticate, requireActor, rentalPhotoUpload, controller.openComplaint);
  router.get('/:id/dispute', authenticate, controller.getDispute);
  router.post('/:id/dispute/response', authenticate, requireActor, rentalPhotoUpload, controller.respondToDispute);

  return router;
}

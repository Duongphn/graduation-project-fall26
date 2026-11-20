import { Router } from 'express';
import { RentalOrderController } from '../controllers/rental-order.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { rentalPhotoUpload } from '../middlewares/upload.middleware.js';
import { type DisputeService } from '../services/dispute.service.js';
import { type RentalOrderService } from '../services/rental-order.service.js';
import { type ReviewService } from '../services/review.service.js';
import { createRentalDisputeRouter } from './dispute.routes.js';
import { createRentalReviewRouter } from './review.routes.js';

export function createRentalOrderRouter(
  service: RentalOrderService,
  disputeService: DisputeService,
  reviewService: ReviewService,
): Router {
  const router = Router();
  const controller = new RentalOrderController(service, disputeService);

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
  router.use(createRentalDisputeRouter(disputeService));
  router.use(createRentalReviewRouter(reviewService));

  return router;
}

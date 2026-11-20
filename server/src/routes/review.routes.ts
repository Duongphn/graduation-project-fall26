import { Router } from 'express';
import { ReviewController } from '../controllers/review.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { type ReviewService } from '../services/review.service.js';

/** Review routes nested under a rental order; mounted by the rental order router at `/rentals`. */
export function createRentalReviewRouter(service: ReviewService): Router {
  const router = Router();
  const controller = new ReviewController(service);

  router.post('/:id/reviews', authenticate, requireActor, controller.submit);
  router.get('/:id/reviews', authenticate, requireActor, controller.list);

  return router;
}

/** Public: reviews of a toy. Mounted at `/toys` before the listing router. */
export function createToyReviewsRouter(service: ReviewService): Router {
  const router = Router();
  router.get('/:id/reviews', new ReviewController(service).listForToy);
  return router;
}

/** Public: reviews a user received. Mounted at `/users` before the authenticated users router. */
export function createUserReviewsRouter(service: ReviewService): Router {
  const router = Router();
  router.get('/:id/reviews', new ReviewController(service).listForUser);
  return router;
}

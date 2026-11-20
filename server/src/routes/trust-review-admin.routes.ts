import { Router } from 'express';
import { TrustReviewController } from '../controllers/trust-review.controller.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { type TrustReviewService } from '../services/trust-review.service.js';

/** Admin trust-review queue (UC24); mounted at `/admin/trust-reviews` after `authenticate`. */
export function createAdminTrustReviewRouter(service: TrustReviewService): Router {
  const router = Router();
  const controller = new TrustReviewController(service);

  router.use(requireAdmin);
  router.get('/', controller.list);
  router.get('/:userId', controller.detail);
  router.post('/:userId/decision', controller.decide);

  return router;
}

import { Router } from 'express';
import { DisputeController } from '../controllers/dispute.controller.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { type DisputeService } from '../services/dispute.service.js';

/** Admin review of disputes (UC19); mounted at `/admin/disputes` after `authenticate`. */
export function createAdminDisputeRouter(service: DisputeService): Router {
  const router = Router();
  const controller = new DisputeController(service);

  router.use(requireAdmin);
  router.get('/', controller.adminList);
  router.get('/:id', controller.adminCaseFile);
  router.post('/:id/resolve', controller.resolve);

  return router;
}

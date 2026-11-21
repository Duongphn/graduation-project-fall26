import { Router } from 'express';
import { RentalDisputeController } from '../controllers/rental-dispute.controller.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { validateRequest } from '../middlewares/validate.js';
import { type RentalDisputeService } from '../services/rental-dispute.service.js';
import { emptyObjectSchema, idParamsSchema } from '../validations/common.validation.js';
import {
  disputeListQuerySchema,
  resolveDisputeBodySchema,
} from '../validations/rental-dispute.validation.js';

// Mounted at /api/v1/admin/disputes behind `authenticate`.
export function createAdminDisputeRouter(service: RentalDisputeService): Router {
  const router = Router();
  const controller = new RentalDisputeController(service);

  router.use(requireAdmin);
  router.get('/', validateRequest({ query: disputeListQuerySchema }), controller.list);
  router.get(
    '/:id',
    validateRequest({ params: idParamsSchema, query: emptyObjectSchema }),
    controller.detail,
  );
  router.post(
    '/:id/resolve',
    validateRequest({ params: idParamsSchema, body: resolveDisputeBodySchema }),
    controller.resolve,
  );

  return router;
}

import { Router } from 'express';

import { emptyObjectSchema, idParamsSchema } from '../validations/common.validation.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { validateRequest } from '../middlewares/validate.js';
import * as controller from '../controllers/identity-review.controller.js';
import './identity-review.openapi.js';
import { identityQueueQuerySchema, rejectIdentityBodySchema } from '../validations/identity-review.validation.js';

// Mounted at /api/v1/admin/identity-verifications behind develop's `authenticate`.
export const adminIdentityReviewRouter = Router();

adminIdentityReviewRouter.use(requireAdmin);

adminIdentityReviewRouter.get(
  '/',
  validateRequest({ query: identityQueueQuerySchema }),
  controller.listQueue,
);
// Before "/:id", so "counts" is never read as an id.
adminIdentityReviewRouter.get(
  '/counts',
  validateRequest({ query: emptyObjectSchema }),
  controller.counts,
);
adminIdentityReviewRouter.get(
  '/:id',
  validateRequest({ params: idParamsSchema, query: emptyObjectSchema }),
  controller.detail,
);
adminIdentityReviewRouter.post(
  '/:id/approve',
  validateRequest({ params: idParamsSchema, body: emptyObjectSchema }),
  controller.approve,
);
adminIdentityReviewRouter.post(
  '/:id/reject',
  validateRequest({ params: idParamsSchema, body: rejectIdentityBodySchema }),
  controller.reject,
);

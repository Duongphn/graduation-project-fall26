import { Router } from 'express';

import { idParamsSchema } from '../../shared/http/schemas.js';
import { requireAdmin } from '../../shared/middleware/require-admin.js';
import { validateRequest } from '../../shared/middleware/validate.js';
import * as controller from './toy-moderation.controller.js';
import './toy-moderation.openapi.js';
import {
  approveToyBodySchema,
  rejectToyBodySchema,
  toyModerationCountsQuerySchema,
  toyModerationQueueQuerySchema,
} from './toy-moderation.schemas.js';

// Admin moderation of toy posts (UC27). Mounted at /api/v1/admin/toys after develop's
// `authenticate`; Admin only.
export const adminToyModerationRouter = Router();

adminToyModerationRouter.use(requireAdmin);

adminToyModerationRouter.get(
  '/',
  validateRequest({ query: toyModerationQueueQuerySchema }),
  controller.listQueue,
);
// Declared before "/:id", so "counts" is not read as an id.
adminToyModerationRouter.get(
  '/counts',
  validateRequest({ query: toyModerationCountsQuerySchema }),
  controller.countByStatus,
);
adminToyModerationRouter.get(
  '/:id',
  validateRequest({ params: idParamsSchema }),
  controller.getDetail,
);
adminToyModerationRouter.post(
  '/:id/approve',
  validateRequest({ params: idParamsSchema, body: approveToyBodySchema }),
  controller.approve,
);
adminToyModerationRouter.post(
  '/:id/reject',
  validateRequest({ params: idParamsSchema, body: rejectToyBodySchema }),
  controller.reject,
);

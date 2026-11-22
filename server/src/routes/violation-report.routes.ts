import { Router } from 'express';

import * as controller from '../controllers/violation-report.controller.js';
import { requireActor } from '../middlewares/require-actor.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { validateRequest } from '../middlewares/validate.js';
import { idParamsSchema } from '../validations/common.validation.js';
import {
  adminReportCountsQuerySchema,
  adminReportListQuerySchema,
  createReportBodySchema,
  resolveReportBodySchema,
} from '../validations/violation-report.validation.js';
import './violation-report.openapi.js';

// UC28: a signed-in User reports a toy post, a user or a message. Mounted at
// /api/v1/violation-reports after `authenticate`.
export const violationReportsRouter = Router();

violationReportsRouter.post(
  '/',
  requireActor,
  validateRequest({ body: createReportBodySchema }),
  controller.create,
);

// UC29: the Admin report queue. Mounted at /api/v1/admin/violation-reports after `authenticate`.
export const adminViolationReportsRouter = Router();

adminViolationReportsRouter.use(requireAdmin);

adminViolationReportsRouter.get(
  '/',
  validateRequest({ query: adminReportListQuerySchema }),
  controller.list,
);
// Declared before "/:id", so "counts" is not read as an id.
adminViolationReportsRouter.get(
  '/counts',
  validateRequest({ query: adminReportCountsQuerySchema }),
  controller.counts,
);
adminViolationReportsRouter.get(
  '/:id',
  validateRequest({ params: idParamsSchema }),
  controller.detail,
);
adminViolationReportsRouter.post(
  '/:id/resolve',
  validateRequest({ params: idParamsSchema, body: resolveReportBodySchema }),
  controller.resolve,
);

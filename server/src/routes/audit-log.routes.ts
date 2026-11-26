import { Router } from 'express';

import * as controller from '../controllers/audit-log.controller.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { validateRequest } from '../middlewares/validate.js';
import { auditLogQuerySchema } from '../validations/audit-log.validation.js';
import { emptyObjectSchema } from '../validations/common.validation.js';
import './audit-log.openapi.js';

// Admin Audit Log (UC31). Mounted at /api/v1/admin/audit-logs after `authenticate`; Admin only.
// Read-only on purpose: there is no route that changes or deletes an entry.
export const adminAuditLogsRouter = Router();

adminAuditLogsRouter.use(requireAdmin);

adminAuditLogsRouter.get('/', validateRequest({ query: auditLogQuerySchema }), controller.list);
adminAuditLogsRouter.get(
  '/filters',
  validateRequest({ query: emptyObjectSchema }),
  controller.filters,
);

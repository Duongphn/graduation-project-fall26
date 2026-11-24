import { Router } from 'express';

import * as controller from '../controllers/account-admin.controller.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  accountCountsQuerySchema,
  accountListQuerySchema,
  lockAccountBodySchema,
  unlockAccountBodySchema,
} from '../validations/account-admin.validation.js';
import { idParamsSchema } from '../validations/common.validation.js';
import './account-admin.openapi.js';

// UC29 account management. Mounted at /api/v1/admin/users after `authenticate`; Admin only.
export const adminAccountsRouter = Router();

adminAccountsRouter.use(requireAdmin);

adminAccountsRouter.get('/', validateRequest({ query: accountListQuerySchema }), controller.list);
// Declared before "/:id", so "counts" is not read as an id.
adminAccountsRouter.get(
  '/counts',
  validateRequest({ query: accountCountsQuerySchema }),
  controller.counts,
);
adminAccountsRouter.get('/:id', validateRequest({ params: idParamsSchema }), controller.detail);
adminAccountsRouter.post(
  '/:id/lock',
  validateRequest({ params: idParamsSchema, body: lockAccountBodySchema }),
  controller.lock,
);
adminAccountsRouter.post(
  '/:id/unlock',
  validateRequest({ params: idParamsSchema, body: unlockAccountBodySchema }),
  controller.unlock,
);

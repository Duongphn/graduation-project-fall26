import { Router } from 'express';

import * as controller from '../controllers/system-setting.controller.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { validateRequest } from '../middlewares/validate.js';
import { emptyObjectSchema } from '../validations/common.validation.js';
import {
  resetSettingBodySchema,
  settingKeyParamsSchema,
  updateSettingBodySchema,
} from '../validations/system-setting.validation.js';
import './system-setting.openapi.js';

// UC30 Configure System. Mounted at /api/v1/admin/settings after `authenticate`; Admin only
// (requireAdmin runs before validation, so 401/403 come first).
export const adminSettingsRouter = Router();

adminSettingsRouter.use(requireAdmin);

adminSettingsRouter.get('/', validateRequest({ query: emptyObjectSchema }), controller.list);
adminSettingsRouter.get(
  '/:key',
  validateRequest({ params: settingKeyParamsSchema }),
  controller.detail,
);
adminSettingsRouter.patch(
  '/:key',
  validateRequest({ params: settingKeyParamsSchema, body: updateSettingBodySchema }),
  controller.update,
);
adminSettingsRouter.post(
  '/:key/reset',
  validateRequest({ params: settingKeyParamsSchema, body: resetSettingBodySchema }),
  controller.reset,
);

// Mounted at /api/v1/settings without sign-in: values a page shows to everyone (withdrawal limits).
export const publicSettingsRouter = Router();

publicSettingsRouter.get(
  '/public',
  validateRequest({ query: emptyObjectSchema }),
  controller.publicSettings,
);

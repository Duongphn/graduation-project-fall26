import { Router } from 'express';

import { idParamsSchema } from '../../shared/http/schemas.js';
import { requireAdmin } from '../../shared/middleware/require-admin.js';
import { validateRequest } from '../../shared/middleware/validate.js';
import * as controller from './categories.controller.js';
import './categories.openapi.js';
import {
  adminCategoryListQuerySchema,
  createCategoryBodySchema,
  reorderCategoriesBodySchema,
  updateCategoryBodySchema,
} from './categories.schemas.js';

// Mounted at /api/v1/admin/categories behind develop's `authenticate` (app/router.ts).
// requireAdmin runs before validation, so 401/403 come first.
export const adminCategoriesRouter = Router();

adminCategoriesRouter.use(requireAdmin);

adminCategoriesRouter.get(
  '/',
  validateRequest({ query: adminCategoryListQuerySchema }),
  controller.listAdmin,
);
adminCategoriesRouter.post(
  '/',
  validateRequest({ body: createCategoryBodySchema }),
  controller.create,
);
// Declared before "/:id", otherwise "reorder" would be read as an id.
adminCategoriesRouter.patch(
  '/reorder',
  validateRequest({ body: reorderCategoriesBodySchema }),
  controller.reorder,
);
adminCategoriesRouter.patch(
  '/:id',
  validateRequest({ params: idParamsSchema, body: updateCategoryBodySchema }),
  controller.update,
);
adminCategoriesRouter.post('/:id/hide', validateRequest({ params: idParamsSchema }), controller.hide);
adminCategoriesRouter.post('/:id/show', validateRequest({ params: idParamsSchema }), controller.show);
adminCategoriesRouter.delete('/:id', validateRequest({ params: idParamsSchema }), controller.remove);

import { Router } from 'express';

import { idParamsSchema } from '../validations/common.validation.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { validateRequest } from '../middlewares/validate.js';
import * as controller from '../controllers/category-admin.controller.js';
import './category-admin.openapi.js';
import {
  adminCategoryListQuerySchema,
  createCategoryBodySchema,
  reorderCategoriesBodySchema,
  updateCategoryBodySchema,
} from '../validations/category-admin.validation.js';

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

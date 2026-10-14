import { Router } from 'express';

import { emptyObjectSchema, idParamsSchema } from '../../shared/http/schemas.js';
import { requireAdmin } from '../../shared/middleware/auth-placeholder.js';
import { optionalAuth } from '../../shared/middleware/optional-auth.js';
import { validateRequest } from '../../shared/middleware/validate.js';
import {
  adminOrganizationsController as admin,
  publicOrganizationsController as publicController,
} from './organizations.controller.js';
import {
  adminOrganizationListQuerySchema,
  createOrganizationBodySchema,
  publicOrganizationListQuerySchema,
  updateOrganizationBodySchema,
} from './organizations.schemas.js';

// Charity organizations (FE-02). Swagger: organizations.openapi.ts.

const byId = validateRequest({ params: idParamsSchema, query: emptyObjectSchema });

/** Mounted at /api/v1/admin/organizations. */
export const adminOrganizationsRouter = Router();
adminOrganizationsRouter.use(requireAdmin);

adminOrganizationsRouter.get(
  '/',
  validateRequest({ query: adminOrganizationListQuerySchema }),
  admin.list,
);
adminOrganizationsRouter.post(
  '/',
  validateRequest({ body: createOrganizationBodySchema }),
  admin.create,
);
adminOrganizationsRouter.get('/:id', byId, admin.get);
adminOrganizationsRouter.patch(
  '/:id',
  validateRequest({ params: idParamsSchema, body: updateOrganizationBodySchema }),
  admin.update,
);
adminOrganizationsRouter.post('/:id/hide', byId, admin.hide);
adminOrganizationsRouter.post('/:id/show', byId, admin.show);
adminOrganizationsRouter.delete('/:id', byId, admin.remove);

/** Mounted at /api/v1/organizations. Public; a signed-in caller also gets the phone. */
export const organizationsRouter = Router();
organizationsRouter.use(optionalAuth);

organizationsRouter.get(
  '/',
  validateRequest({ query: publicOrganizationListQuerySchema }),
  publicController.list,
);
organizationsRouter.get('/:id', byId, publicController.get);

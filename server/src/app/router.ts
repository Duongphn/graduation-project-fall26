import { Router } from 'express';
import { authRouter } from '../features/auth/auth.routes.js';
import { categoriesRouter } from '../features/categories/categories.routes.js';
import { adminCategoriesRouter } from '../features/categories/index.js';
import {
  adminDonationRequestsRouter,
  createDonationPostsRouter,
  donationRequestsRouter,
  donorProfileRouter,
} from '../features/donation_requests/index.js';
import { healthRouter } from '../features/health/health.routes.js';
import { adminIdentityReviewRouter } from '../features/identity_verifications/index.js';
import { notificationsRouter } from '../features/notifications/index.js';
import { adminOrganizationsRouter, organizationsRouter } from '../features/organizations/index.js';
import { adminToyModerationRouter } from '../features/toys/index.js';
import { uploadsRouter } from '../features/uploads/index.js';
import { featureEnv } from '../config/feature-env.js';
import { createDocsRouter } from '../infrastructure/docs/openapi.js';
import { authenticate } from '../shared/middleware/authenticate.js';
import {
  createToyCatalogDependencies,
  type ToyCatalogDependencies,
} from './toy-catalog-dependencies.js';
import {
  createToyListingDependencies,
  type ToyListingDependencies,
} from './toy-listing-dependencies.js';
import {
  createUC03Dependencies,
  type UC03Dependencies,
} from './uc03-dependencies.js';

export interface ApiRouterDependencies {
  toyListingDependencies?: ToyListingDependencies;
  toyCatalogDependencies?: ToyCatalogDependencies;
  uc03Dependencies?: UC03Dependencies;
}

export function createApiRouter(deps?: ApiRouterDependencies): Router {
  const router = Router();

  router.use(healthRouter);
  router.use(authRouter);
  router.use('/categories', categoriesRouter);

  // Thứ tự quan trọng: router đăng tin (bắt đăng nhập cho /mine, POST, PATCH…) đứng trước router công khai
  // (GET /, /:toyId, /:toyId/availability) để /toys/mine không bị coi là /:toyId.
  const toyListing = deps?.toyListingDependencies ?? createToyListingDependencies();
  const toyCatalog = deps?.toyCatalogDependencies ?? createToyCatalogDependencies();

  router.use('/toys', toyListing.router);
  router.use('/toys', toyCatalog.router);

  const uc03 = deps?.uc03Dependencies ?? createUC03Dependencies();
  router.use('/users', authenticate, uc03.usersRouter);
  router.use('/identity-verifications', authenticate, uc03.identityVerificationRouter);

  // Admin back office and charity donations (each router checks requireActor / requireAdmin).
  router.use('/admin/categories', authenticate, adminCategoriesRouter);
  router.use('/admin/organizations', authenticate, adminOrganizationsRouter);
  router.use('/admin/toys', authenticate, adminToyModerationRouter);
  router.use('/admin/identity-verifications', authenticate, adminIdentityReviewRouter);
  router.use('/admin/donation-requests', authenticate, adminDonationRequestsRouter);
  router.use('/organizations', organizationsRouter);
  router.use('/notifications', authenticate, notificationsRouter);
  router.use('/donation-requests', authenticate, donationRequestsRouter);
  router.use('/donation-posts', authenticate, createDonationPostsRouter(toyListing.imageStorage));
  router.use('/donors', donorProfileRouter);
  router.use('/uploads', authenticate, uploadsRouter);

  // Swagger UI and the OpenAPI JSON of the documented routes (never in production).
  if (featureEnv.docsEnabled) {
    router.use('/docs', createDocsRouter());
  }

  return router;
}

export const apiRouter = createApiRouter();

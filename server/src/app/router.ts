import { Router } from 'express';

import { authRouter } from '../features/auth/index.js';
import { adminCategoriesRouter, categoriesRouter } from '../features/categories/index.js';
import {
  adminDonationRequestsRouter,
  donationRequestsRouter,
  donorProfileRouter,
} from '../features/donation_requests/index.js';
import { healthRouter } from '../features/health/index.js';
import { notificationsRouter } from '../features/notifications/index.js';
import { adminIdentityReviewRouter } from '../features/identity_verifications/index.js';
import { adminOrganizationsRouter, organizationsRouter } from '../features/organizations/index.js';
import { adminToyModerationRouter } from '../features/toys/index.js';
import { uploadsRouter } from '../features/uploads/index.js';
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
  // One line per feature: the app mounts each feature router on its prefix.
  router.use('/admin/categories', adminCategoriesRouter);
  // The auth router declares its own /auth/* paths.
  router.use(authRouter);
  router.use('/categories', categoriesRouter);
  router.use('/admin/organizations', adminOrganizationsRouter);
  router.use('/organizations', organizationsRouter);
  router.use('/admin/toys', adminToyModerationRouter);
  router.use('/admin/identity-verifications', adminIdentityReviewRouter);
  router.use('/notifications', notificationsRouter);
  router.use('/admin/donation-requests', adminDonationRequestsRouter);
  router.use('/donation-requests', donationRequestsRouter);
  router.use('/users', donorProfileRouter);
  router.use('/uploads', uploadsRouter);

  const toyListing = deps?.toyListingDependencies ?? createToyListingDependencies();
  const toyCatalog = deps?.toyCatalogDependencies ?? createToyCatalogDependencies();

  router.use('/toys', toyListing.router);
  router.use('/toys', toyCatalog.router);

  const uc03 = deps?.uc03Dependencies ?? createUC03Dependencies();
  router.use('/users', authenticate, uc03.usersRouter);
  router.use('/identity-verifications', authenticate, uc03.identityVerificationRouter);

  return router;
}

export const apiRouter = createApiRouter();

import { Router } from 'express';
import { authRouter } from '../features/auth/auth.routes.js';

import { categoriesRouter } from '../features/categories/categories.routes.js';
import { healthRouter } from '../features/health/health.routes.js';
import { paymentsRouter } from '../features/payments/payments.routes.js';
import {
  createToyListingDependencies,
  type ToyListingDependencies,
} from './toy-listing-dependencies.js';

export function createApiRouter(deps?: { toyListingDependencies?: ToyListingDependencies }): Router {
  const router = Router();

  router.use(healthRouter);
  router.use(authRouter);
  router.use('/categories', categoriesRouter);
  router.use('/payments', paymentsRouter);

  const toyListing = deps?.toyListingDependencies ?? createToyListingDependencies();
  router.use('/toys', toyListing.router);

  return router;
}

export const apiRouter = createApiRouter();

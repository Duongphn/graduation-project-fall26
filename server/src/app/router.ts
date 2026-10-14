import { Router } from 'express';

import { categoriesRouter } from '../features/categories/categories.routes.js';
import { healthRouter } from '../features/health/health.routes.js';
import {
  createToyListingDependencies,
  type ToyListingDependencies,
} from './toy-listing-dependencies.js';

export function createApiRouter(deps?: { toyListingDependencies?: ToyListingDependencies }): Router {
  const router = Router();

  router.use(healthRouter);
  router.use('/categories', categoriesRouter);

  const toyListing = deps?.toyListingDependencies ?? createToyListingDependencies();
  router.use('/toys', toyListing.router);

  return router;
}

export const apiRouter = createApiRouter();


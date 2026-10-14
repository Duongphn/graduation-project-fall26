import { Router } from 'express';

import { categoriesRouter } from '../features/categories/categories.routes.js';
import { healthRouter } from '../features/health/health.routes.js';
import {
  createToyCatalogDependencies,
  type ToyCatalogDependencies,
} from './toy-catalog-dependencies.js';
import {
  createToyListingDependencies,
  type ToyListingDependencies,
} from './toy-listing-dependencies.js';

export interface ApiRouterDependencies {
  toyListingDependencies?: ToyListingDependencies;
  toyCatalogDependencies?: ToyCatalogDependencies;
}

export function createApiRouter(deps?: ApiRouterDependencies): Router {
  const router = Router();

  router.use(healthRouter);
  router.use('/categories', categoriesRouter);

  const toyListing = deps?.toyListingDependencies ?? createToyListingDependencies();
  const toyCatalog = deps?.toyCatalogDependencies ?? createToyCatalogDependencies();

  router.use('/toys', toyListing.router);
  router.use('/toys', toyCatalog.router);

  return router;
}

export const apiRouter = createApiRouter();

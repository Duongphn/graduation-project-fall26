import { Router } from 'express';

import { adminCategoriesRouter, categoriesRouter } from '../features/categories/index.js';
import { healthRouter } from '../features/health/index.js';
import { uploadsRouter } from '../features/uploads/index.js';
import {
  createToyListingDependencies,
  type ToyListingDependencies,
} from './toy-listing-dependencies.js';

export function createApiRouter(deps?: { toyListingDependencies?: ToyListingDependencies }): Router {
  const router = Router();

  router.use(healthRouter);
  // One line per feature: the app mounts each feature router on its prefix.
  router.use('/admin/categories', adminCategoriesRouter);
  router.use('/categories', categoriesRouter);
  router.use('/uploads', uploadsRouter);

  const toyListing = deps?.toyListingDependencies ?? createToyListingDependencies();
  router.use('/toys', toyListing.router);

  return router;
}

export const apiRouter = createApiRouter();

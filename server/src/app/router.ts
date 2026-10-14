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

export function createApiRouter(deps?: {
  toyListingDependencies?: ToyListingDependencies;
  toyCatalogDependencies?: ToyCatalogDependencies;
}): Router {
  const router = Router();

  router.use(healthRouter);
  router.use('/categories', categoriesRouter);

  // Thứ tự quan trọng: router công khai (chỉ GET /toys) đứng trước router đăng tin (bắt đăng nhập),
  // để khách xem được danh sách mà /toys/mine, POST, PATCH… vẫn yêu cầu đăng nhập như cũ.
  const toyCatalog = deps?.toyCatalogDependencies ?? createToyCatalogDependencies();
  router.use('/toys', toyCatalog.router);

  const toyListing = deps?.toyListingDependencies ?? createToyListingDependencies();
  router.use('/toys', toyListing.router);

  return router;
}

export const apiRouter = createApiRouter();

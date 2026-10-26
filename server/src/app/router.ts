import { Router } from 'express';
import { authRouter } from '../features/auth/auth.routes.js';
import { categoriesRouter } from '../features/categories/categories.routes.js';
import { healthRouter } from '../features/health/health.routes.js';
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

  // Thứ tự quan trọng: router đăng tin đứng trước router công khai để /toys/mine không bị
  // hiểu là GET /toys/:toyId. Router đăng tin chỉ gắn requireActor trên từng route,
  // nên khách vẫn đi tiếp tới GET /toys, /toys/showcase, /toys/:toyId… mà không cần đăng nhập.
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

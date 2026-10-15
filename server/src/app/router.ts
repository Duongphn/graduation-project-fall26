import { Router } from 'express';
import { authRouter } from '../features/auth/auth.routes.js';
import { categoriesRouter } from '../features/categories/categories.routes.js';
import { healthRouter } from '../features/health/health.routes.js';
import { authenticate } from '../shared/middleware/authenticate.js';
import {
  createToyListingDependencies,
  type ToyListingDependencies,
} from './toy-listing-dependencies.js';
import {
  createUC03Dependencies,
  type UC03Dependencies,
} from './uc03-dependencies.js';

export interface CreateApiRouterDependencies {
  toyListingDependencies?: ToyListingDependencies;
  uc03Dependencies?: UC03Dependencies;
}

export function createApiRouter(deps?: CreateApiRouterDependencies): Router {
  const router = Router();

  router.use(healthRouter);
  router.use(authRouter);
  router.use('/categories', categoriesRouter);

  const toyListing = deps?.toyListingDependencies ?? createToyListingDependencies();
  router.use('/toys', toyListing.router);

  const uc03 = deps?.uc03Dependencies ?? createUC03Dependencies();
  router.use('/users', authenticate, uc03.usersRouter);
  router.use('/identity-verifications', authenticate, uc03.identityVerificationRouter);

  return router;
}

export const apiRouter = createApiRouter();

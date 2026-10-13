import { Router } from 'express';

import { healthRouter } from '../features/health/health.routes.js';
import { createToyListingDependencies } from './toy-listing-dependencies.js';

export const apiRouter = Router();

apiRouter.use(healthRouter);

const toyListingDependencies = createToyListingDependencies();
apiRouter.use('/toys', toyListingDependencies.router);

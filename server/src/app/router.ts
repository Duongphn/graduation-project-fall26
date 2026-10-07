import { Router } from 'express';

import { healthRouter } from '../features/health/health.routes.js';

export const apiRouter = Router();

apiRouter.use(healthRouter);

// Feature routes are mounted here after their requirements and permissions are approved.

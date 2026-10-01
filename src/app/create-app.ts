import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from '../config/env.js';
import { errorHandler } from '../shared/middleware/error-handler.js';
import { notFoundHandler } from '../shared/middleware/not-found.js';
import { apiRouter } from './router.js';

export const createApp = (): express.Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.nodeEnv === 'test' ? 'tiny' : 'dev'));

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

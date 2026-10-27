import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { createContainer, type ContainerOverrides } from './container.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFoundHandler } from './middlewares/not-found.js';
import { createApiRouter } from './routes/index.js';

export const createApp = (overrides?: ContainerOverrides): express.Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.nodeEnv === 'test' ? 'tiny' : 'dev'));

  app.use('/api/v1', createApiRouter(createContainer(overrides)));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

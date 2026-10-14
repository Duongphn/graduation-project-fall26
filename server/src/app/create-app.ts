import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from '../config/env.js';
import { createDocsRouter } from '../infrastructure/docs/openapi.js';
import { errorHandler } from '../shared/middleware/error-handler.js';
import { notFoundHandler } from '../shared/middleware/not-found.js';
import { apiRouter } from './router.js';

export const createApp = (): express.Express => {
  const app = express();

  app.disable('x-powered-by');
  // Swagger UI needs inline scripts, so it is mounted before Helmet's Content-Security-Policy.
  if (env.docsEnabled) {
    app.use('/api/docs', createDocsRouter());
  }
  app.use(helmet());
  // credentials: the web app sends the refresh-token cookie (R04 III.1.1); CORS_ORIGIN may list
  // several origins separated by commas.
  app.use(
    cors({ origin: env.corsOrigin.split(',').map((origin) => origin.trim()), credentials: true }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.nodeEnv === 'test' ? 'tiny' : 'dev'));

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

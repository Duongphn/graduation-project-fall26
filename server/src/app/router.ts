import { Router } from 'express';
import { authRouter } from '../features/auth/auth.routes.js';

export const apiRouter = Router();

// Health check endpoint
apiRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'toyflow-backend' });
});

// Mount feature routes
apiRouter.use(authRouter);

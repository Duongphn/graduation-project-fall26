import { Router } from 'express';

import { requireUser } from '../../shared/middleware/auth-placeholder.js';
import { validateRequest } from '../../shared/middleware/validate.js';
import * as controller from './uploads.controller.js';
import { uploadSignatureBodySchema } from './uploads.schemas.js';

// Mounted at /api/v1/uploads.
export const uploadsRouter = Router();

uploadsRouter.post(
  '/signature',
  requireUser,
  validateRequest({ body: uploadSignatureBodySchema }),
  controller.createSignature,
);

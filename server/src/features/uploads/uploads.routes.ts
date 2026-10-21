import { Router } from 'express';

import { validateRequest } from '../../shared/middleware/validate.js';
import * as controller from './uploads.controller.js';
import { uploadSignatureBodySchema } from './uploads.schemas.js';

// Mounted at /api/v1/uploads behind develop's `authenticate` (any signed-in user or Admin).
export const uploadsRouter = Router();

uploadsRouter.post(
  '/signature',
  validateRequest({ body: uploadSignatureBodySchema }),
  controller.createSignature,
);

import './upload.openapi.js';
import { Router } from 'express';

import { validateRequest } from '../middlewares/validate.js';
import * as controller from '../controllers/upload.controller.js';
import { uploadSignatureBodySchema } from '../validations/upload.validation.js';

// Mounted at /api/v1/uploads behind develop's `authenticate` (any signed-in user or Admin).
export const uploadsRouter = Router();

uploadsRouter.post(
  '/signature',
  validateRequest({ body: uploadSignatureBodySchema }),
  controller.createSignature,
);

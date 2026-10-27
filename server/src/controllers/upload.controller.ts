import type { Request, Response } from 'express';

import { getRequestAuth } from '../utils/admin-context.js';
import { getValidatedBody } from '../middlewares/validate.js';
import { unauthorized } from '../utils/http-errors.js';
import { sendSuccess } from '../utils/response.js';
import type { UploadSignatureBody } from '../validations/upload.validation.js';
import { signUpload } from '../services/upload.service.js';

export const createSignature = (request: Request, response: Response) => {
  const auth = getRequestAuth(request);
  if (!auth) throw unauthorized();
  const { purpose } = getValidatedBody<UploadSignatureBody>(request);
  sendSuccess(response, signUpload(purpose, auth));
};

import type { Request, Response } from 'express';

import { getRequestAuth } from '../../shared/http/admin-context.js';
import { getValidatedBody } from '../../shared/middleware/validate.js';
import { unauthorized } from '../../shared/errors/http-errors.js';
import { sendSuccess } from '../../shared/utils/response.js';
import type { UploadSignatureBody } from './uploads.schemas.js';
import { signUpload } from './uploads.service.js';

export const createSignature = (request: Request, response: Response) => {
  const auth = getRequestAuth(request);
  if (!auth) throw unauthorized();
  const { purpose } = getValidatedBody<UploadSignatureBody>(request);
  sendSuccess(response, signUpload(purpose, auth));
};

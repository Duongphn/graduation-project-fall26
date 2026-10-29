import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../config/openapi.js';
import { successResponseSchema } from '../validations/common.validation.js';
import { uploadSignatureBodySchema, uploadSignatureSchema } from '../validations/upload.validation.js';

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/uploads/signature',
  tags: ['Uploads'],
  summary: 'Sign one direct image upload to Cloudinary',
  description:
    'The public_id (<purpose folder>/<caller id>/<random>) and delivery type come from the ' +
    'purpose and the caller. Private purposes (identity, handover, dispute) upload as ' +
    '"authenticated". POST the file to uploadUrl with every entry of `fields` (one upload per ' +
    'signature, jpg/png/webp only), then pass the returned public_id/secure_url/format to the API.',
  security: bearerAuthSecurity,
  request: { body: { content: jsonContent(uploadSignatureBodySchema) } },
  responses: {
    200: {
      description: 'Upload parameters',
      content: jsonContent(successResponseSchema(uploadSignatureSchema)),
    },
    ...errorResponses(400, 401, 403, 503),
  },
});

import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../../../infrastructure/docs/openapi.js';
import {
  idParamsSchema,
  paginatedResponseSchema,
  successResponseSchema,
} from '../../../shared/http/schemas.js';
import {
  identityCountsSchema,
  identityDetailSchema,
  identityQueueItemSchema,
  identityQueueQuerySchema,
  identityReviewResultSchema,
  rejectIdentityBodySchema,
} from './identity-review.schemas.js';

const BASE = '/api/v1/admin/identity-verifications';
const tags = ['Admin identity review'];

openApiRegistry.registerPath({
  method: 'get',
  path: BASE,
  tags,
  summary: 'Queue of identity verifications by status (no document links)',
  security: bearerAuthSecurity,
  request: { query: identityQueueQuerySchema },
  responses: {
    200: {
      description: 'One page of the queue',
      content: jsonContent(paginatedResponseSchema(identityQueueItemSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: `${BASE}/counts`,
  tags,
  summary: 'Number of verifications per status (tab badges)',
  security: bearerAuthSecurity,
  responses: {
    200: {
      description: 'Counts',
      content: jsonContent(successResponseSchema(identityCountsSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: `${BASE}/{id}`,
  tags,
  summary: 'One verification, with 5-minute document links while PENDING',
  description:
    'Links are signed only while the request is PENDING, never as a raw or public URL, and each ' +
    'issue is written to the audit log as identity.view_documents. Refetch before ' +
    'previewExpiresAt for fresh links.',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'Detail',
      content: jsonContent(successResponseSchema(identityDetailSchema)),
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${BASE}/{id}/approve`,
  tags,
  summary: 'Verify the identity (PENDING -> VERIFIED; users.identityStatus = VERIFIED)',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'Decided',
      content: jsonContent(successResponseSchema(identityReviewResultSchema)),
    },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${BASE}/{id}/reject`,
  tags,
  summary: 'Reject with a reason (PENDING -> REJECTED; users.identityStatus = REJECTED)',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema, body: { content: jsonContent(rejectIdentityBodySchema) } },
  responses: {
    200: {
      description: 'Decided',
      content: jsonContent(successResponseSchema(identityReviewResultSchema)),
    },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

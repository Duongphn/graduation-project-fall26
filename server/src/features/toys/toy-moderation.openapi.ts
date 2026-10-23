import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../../infrastructure/docs/openapi.js';
import {
  idParamsSchema,
  paginatedResponseSchema,
  successResponseSchema,
} from '../../shared/http/schemas.js';
import {
  approveToyBodySchema,
  rejectToyBodySchema,
  toyModerationCountsQuerySchema,
  toyModerationDecisionSchema,
  toyModerationDetailSchema,
  toyModerationListItemSchema,
  toyModerationQueueQuerySchema,
  toyStatusCountsSchema,
} from './toy-moderation.schemas.js';

const BASE = '/api/v1/admin/toys';
const tags = ['Admin - Toy moderation'];

openApiRegistry.registerPath({
  method: 'get',
  path: BASE,
  tags,
  summary: 'Moderation queue of toy posts (UC27)',
  description: 'Default status pending, oldest submission first. Phones are masked (GB-35).',
  security: bearerAuthSecurity,
  request: { query: toyModerationQueueQuerySchema },
  responses: {
    200: {
      description: 'One page of posts',
      content: jsonContent(paginatedResponseSchema(toyModerationListItemSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: `${BASE}/counts`,
  tags,
  summary: 'Number of posts in every status, for the queue tabs',
  security: bearerAuthSecurity,
  request: { query: toyModerationCountsQuerySchema },
  responses: {
    200: {
      description: 'Counts',
      content: jsonContent(successResponseSchema(toyStatusCountsSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: `${BASE}/{id}`,
  tags,
  summary: 'A post with its owner, settings and rule-based warnings (GB-07, GB-11)',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'The post',
      content: jsonContent(successResponseSchema(toyModerationDetailSchema)),
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

const decisionResponses = {
  200: {
    description: 'Decision saved',
    content: jsonContent(successResponseSchema(toyModerationDecisionSchema)),
  },
  ...errorResponses(400, 401, 403, 404, 409, 422),
};

openApiRegistry.registerPath({
  method: 'post',
  path: `${BASE}/{id}/approve`,
  tags,
  summary: 'Approve a pending post (pending -> active)',
  description:
    '409 TOY_CHANGED when updatedAt differs from expectedUpdatedAt (the Owner edited the post), ' +
    '409 TOY_ALREADY_DECIDED when it is no longer pending, 409 CATEGORY_NOT_AVAILABLE when the ' +
    'category is hidden or deleted, 422 OWNER_NOT_ELIGIBLE when the owner is not identity ' +
    'VERIFIED or is locked (BF-01).',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema, body: { content: jsonContent(approveToyBodySchema) } },
  responses: decisionResponses,
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${BASE}/{id}/reject`,
  tags,
  summary: 'Reject a pending post with a reason shown to the Owner',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema, body: { content: jsonContent(rejectToyBodySchema) } },
  responses: decisionResponses,
});

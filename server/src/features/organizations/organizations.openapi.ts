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
import { z } from '../../shared/validation/zod.js';
import {
  adminOrganizationListQuerySchema,
  adminOrganizationSchema,
  createOrganizationBodySchema,
  publicOrganizationListQuerySchema,
  publicOrganizationSchema,
  updateOrganizationBodySchema,
} from './organizations.schemas.js';

const adminTag = 'Admin - Charity organizations';
const publicTag = 'Charity organizations';
const adminPath = '/api/v1/admin/organizations';
// Public routes work without signing in.
const optionalSecurity = [{}];

const adminOrganizationResponse = {
  description: 'The organization',
  content: jsonContent(successResponseSchema(adminOrganizationSchema)),
};

openApiRegistry.registerPath({
  method: 'get',
  path: adminPath,
  tags: [adminTag],
  summary: 'List organizations with their donation request counts',
  security: bearerAuthSecurity,
  request: { query: adminOrganizationListQuerySchema },
  responses: {
    200: {
      description: 'A page of organizations',
      content: jsonContent(paginatedResponseSchema(adminOrganizationSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: adminPath,
  tags: [adminTag],
  summary: 'Add an organization (active: the Admin has checked it)',
  description:
    '409 ORGANIZATION_NAME_TAKEN when the name exists.',
  security: bearerAuthSecurity,
  request: { body: { content: jsonContent(createOrganizationBodySchema) } },
  responses: {
    201: adminOrganizationResponse,
    ...errorResponses(400, 401, 403, 409),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: `${adminPath}/{id}`,
  tags: [adminTag],
  summary: 'Organization detail',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: { 200: adminOrganizationResponse, ...errorResponses(400, 401, 403, 404) },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: `${adminPath}/{id}`,
  tags: [adminTag],
  summary: 'Edit an organization',
  security: bearerAuthSecurity,
  request: {
    params: idParamsSchema,
    body: { content: jsonContent(updateOrganizationBodySchema) },
  },
  responses: { 200: adminOrganizationResponse, ...errorResponses(400, 401, 403, 404, 409) },
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${adminPath}/{id}/hide`,
  tags: [adminTag],
  summary: 'Hide an organization (active -> hidden)',
  description:
    'Always allowed: running donation requests continue, no new request can choose it. ' +
    '409 ORGANIZATION_ALREADY_HIDDEN, ORGANIZATION_STATUS_CHANGED.',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: { 200: adminOrganizationResponse, ...errorResponses(400, 401, 403, 404, 409) },
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${adminPath}/{id}/show`,
  tags: [adminTag],
  summary: 'Show a hidden organization again (hidden -> active)',
  description: '409 ORGANIZATION_ALREADY_VISIBLE, ORGANIZATION_STATUS_CHANGED.',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: { 200: adminOrganizationResponse, ...errorResponses(400, 401, 403, 404, 409) },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: `${adminPath}/{id}`,
  tags: [adminTag],
  summary: 'Delete an organization that never received a donation request',
  description:
    '409 ORGANIZATION_HAS_OPEN_REQUESTS (requests in progress: hide it instead), ' +
    '409 ORGANIZATION_IN_USE (past requests are kept, GB-36). ' +
    'details = { openRequestCount, requestCount }.',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: {
    200: { description: 'Deleted', content: jsonContent(successResponseSchema(z.null())) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/organizations',
  tags: [publicTag],
  summary: 'Active organizations for Donors',
  description:
    'No sign-in needed. Filter: q (accent-insensitive). Sorted by name (A-Z) by default.',
  security: optionalSecurity,
  request: { query: publicOrganizationListQuerySchema },
  responses: {
    200: {
      description: 'A page of organizations',
      content: jsonContent(paginatedResponseSchema(publicOrganizationSchema)),
    },
    ...errorResponses(400),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/organizations/{id}',
  tags: [publicTag],
  summary: 'One active organization',
  security: optionalSecurity,
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'The organization',
      content: jsonContent(successResponseSchema(publicOrganizationSchema)),
    },
    ...errorResponses(400, 404),
  },
});

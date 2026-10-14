import {
  devAuthSecurity,
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
// Public routes work without signing in; a signed-in caller also gets the phone number.
const optionalSecurity = [{}, ...devAuthSecurity];

const adminOrganizationResponse = {
  description: 'The organization (full phone number)',
  content: jsonContent(successResponseSchema(adminOrganizationSchema)),
};

openApiRegistry.registerPath({
  method: 'get',
  path: adminPath,
  tags: [adminTag],
  summary: 'List organizations with their donation request counts',
  security: devAuthSecurity,
  request: { query: adminOrganizationListQuerySchema },
  responses: {
    200: {
      description: 'A page of organizations; the phone number is masked (GB-35).',
      content: jsonContent(paginatedResponseSchema(adminOrganizationSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: adminPath,
  tags: [adminTag],
  summary: 'Add an organization (ACTIVE: the Admin has checked it)',
  description:
    'logoUrl must be the secure_url of a signed upload with purpose ORGANIZATION_LOGO. ' +
    '409 ORGANIZATION_NAME_TAKEN when the name exists (case-insensitive).',
  security: devAuthSecurity,
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
  security: devAuthSecurity,
  request: { params: idParamsSchema },
  responses: { 200: adminOrganizationResponse, ...errorResponses(400, 401, 403, 404) },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: `${adminPath}/{id}`,
  tags: [adminTag],
  summary: 'Edit an organization (null clears description or logoUrl)',
  security: devAuthSecurity,
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
  summary: 'Hide an organization (ACTIVE -> HIDDEN)',
  description:
    'Always allowed: running donation requests continue, no new request can choose it. ' +
    '409 ORGANIZATION_ALREADY_HIDDEN, ORGANIZATION_STATUS_CHANGED.',
  security: devAuthSecurity,
  request: { params: idParamsSchema },
  responses: { 200: adminOrganizationResponse, ...errorResponses(400, 401, 403, 404, 409) },
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${adminPath}/{id}/show`,
  tags: [adminTag],
  summary: 'Show a hidden organization again (HIDDEN -> ACTIVE)',
  description: '409 ORGANIZATION_ALREADY_VISIBLE, ORGANIZATION_STATUS_CHANGED.',
  security: devAuthSecurity,
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
  security: devAuthSecurity,
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
  summary: 'ACTIVE organizations for Donors',
  description:
    'No sign-in needed. Filters: province, ageGroup, q (accent-insensitive). Sorted by name ' +
    '(A-Z) by default. The phone number is only returned to signed-in callers.',
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
  summary: 'One ACTIVE organization',
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

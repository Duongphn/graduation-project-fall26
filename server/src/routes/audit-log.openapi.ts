import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../config/openapi.js';
import {
  auditLogFiltersSchema,
  auditLogItemSchema,
  auditLogQuerySchema,
} from '../validations/audit-log.validation.js';
import {
  paginatedResponseSchema,
  successResponseSchema,
} from '../validations/common.validation.js';

const BASE = '/api/v1/admin/audit-logs';
const tags = ['Admin - Audit log'];

openApiRegistry.registerPath({
  method: 'get',
  path: BASE,
  tags,
  summary: 'Audit log of important actions (UC31), newest first',
  description:
    'Filter by actor, action (exact or area) and time range. Read-only: entries cannot be ' +
    'changed or deleted (GB-36).',
  security: bearerAuthSecurity,
  request: { query: auditLogQuerySchema },
  responses: {
    200: {
      description: 'One page of entries',
      content: jsonContent(paginatedResponseSchema(auditLogItemSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: `${BASE}/filters`,
  tags,
  summary: 'Values for the audit log filters (actions written so far, Admin accounts)',
  security: bearerAuthSecurity,
  responses: {
    200: {
      description: 'Filter values',
      content: jsonContent(successResponseSchema(auditLogFiltersSchema)),
    },
    ...errorResponses(401, 403),
  },
});

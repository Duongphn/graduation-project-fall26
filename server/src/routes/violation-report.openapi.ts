import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../config/openapi.js';
import {
  apiErrorSchema,
  idParamsSchema,
  paginatedResponseSchema,
  successResponseSchema,
} from '../validations/common.validation.js';
import {
  adminReportCountsQuerySchema,
  adminReportDetailSchema,
  adminReportListItemSchema,
  adminReportListQuerySchema,
  createdReportSchema,
  createReportBodySchema,
  reportStatusCountsSchema,
  resolveReportBodySchema,
  resolveReportResultSchema,
} from '../validations/violation-report.validation.js';

const userTags = ['Violation reports'];
const adminTags = ['Admin - Violation reports'];
const ADMIN_BASE = '/api/v1/admin/violation-reports';

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/violation-reports',
  tags: userTags,
  summary: 'Report a toy post, a user or a message (UC28)',
  description:
    'Signed-in User only. Evidence photos are uploaded first with POST /uploads/signature ' +
    '(purpose REPORT_EVIDENCE) and sent as { publicId, format }. 404 REPORT_TARGET_NOT_FOUND ' +
    '(toy not Active, user unknown, message not in a conversation of the reporter), 422 ' +
    'CANNOT_REPORT_SELF, 422 EVIDENCE_NOT_OWNED, 409 REPORT_ALREADY_PENDING (GB-37), 429 ' +
    'REPORT_RATE_LIMITED (more than 10 reports in 24 hours).',
  security: bearerAuthSecurity,
  request: { body: { content: jsonContent(createReportBodySchema) } },
  responses: {
    201: {
      description: 'Report saved as pending',
      content: jsonContent(successResponseSchema(createdReportSchema)),
    },
    ...errorResponses(400, 401, 403, 404, 409, 422),
    429: { description: 'Too many reports', content: jsonContent(apiErrorSchema) },
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: ADMIN_BASE,
  tags: adminTags,
  summary: 'Violation report list (UC29)',
  description:
    'Default status pending: unsafe toy reports first (GB-49), then the oldest first. Other ' +
    'statuses: the most recently handled first.',
  security: bearerAuthSecurity,
  request: { query: adminReportListQuerySchema },
  responses: {
    200: {
      description: 'One page of reports',
      content: jsonContent(paginatedResponseSchema(adminReportListItemSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: `${ADMIN_BASE}/counts`,
  tags: adminTags,
  summary: 'Number of reports in every status, for the tabs',
  security: bearerAuthSecurity,
  request: { query: adminReportCountsQuerySchema },
  responses: {
    200: { description: 'Counts', content: jsonContent(successResponseSchema(reportStatusCountsSchema)) },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: `${ADMIN_BASE}/{id}`,
  tags: adminTags,
  summary: 'A report with its target, the reported user and signed evidence links',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: {
    200: { description: 'The report', content: jsonContent(successResponseSchema(adminReportDetailSchema)) },
    ...errorResponses(400, 401, 403, 404),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${ADMIN_BASE}/{id}/resolve`,
  tags: adminTags,
  summary: 'Handle a pending report: dismiss, remove the listing, warn or lock (UC29)',
  description:
    'The other pending reports on the same target get the same outcome. lock needs ' +
    'lockDuration (7d, 30d, permanent) and a note of 20 to 300 characters; it hides the ' +
    "user's Active listings, ends their sessions and freezes withdrawals; running orders " +
    'continue. 409 REPORT_ALREADY_HANDLED, 409 ACCOUNT_ALREADY_LOCKED, 422 ACTION_NOT_ALLOWED ' +
    '(remove_listing on a non-toy report), 422 CANNOT_LOCK_ADMIN.',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema, body: { content: jsonContent(resolveReportBodySchema) } },
  responses: {
    200: {
      description: 'Report handled',
      content: jsonContent(successResponseSchema(resolveReportResultSchema)),
    },
    ...errorResponses(400, 401, 403, 404, 409, 422),
  },
});

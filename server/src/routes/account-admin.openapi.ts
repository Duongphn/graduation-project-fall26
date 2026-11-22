import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../config/openapi.js';
import {
  accountActionResultSchema,
  accountCountsQuerySchema,
  accountCountsSchema,
  accountDetailSchema,
  accountListItemSchema,
  accountListQuerySchema,
  lockAccountBodySchema,
  unlockAccountBodySchema,
} from '../validations/account-admin.validation.js';
import {
  idParamsSchema,
  paginatedResponseSchema,
  successResponseSchema,
} from '../validations/common.validation.js';

const BASE = '/api/v1/admin/users';
const tags = ['Admin - Accounts'];

openApiRegistry.registerPath({
  method: 'get',
  path: BASE,
  tags,
  summary: 'User accounts with status and violation count (UC29)',
  description: 'Phones and emails are masked (GB-35). sortBy=violationCount sorts by violations.',
  security: bearerAuthSecurity,
  request: { query: accountListQuerySchema },
  responses: {
    200: {
      description: 'One page of accounts',
      content: jsonContent(paginatedResponseSchema(accountListItemSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: `${BASE}/counts`,
  tags,
  summary: 'Counters of the tabs All, Active, Locked and New reports',
  security: bearerAuthSecurity,
  request: { query: accountCountsQuerySchema },
  responses: {
    200: { description: 'Counts', content: jsonContent(successResponseSchema(accountCountsSchema)) },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: `${BASE}/{id}`,
  tags,
  summary: 'One account with its lock and violation history (read-only profile)',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: {
    200: { description: 'The account', content: jsonContent(successResponseSchema(accountDetailSchema)) },
    ...errorResponses(400, 401, 403, 404),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${BASE}/{id}/lock`,
  tags,
  summary: 'Lock an account for 7 days, 30 days or permanently, with a reason (UC29, GB-05)',
  description:
    "Hides the user's Active listings, ends their sessions (refresh tokens) and freezes wallet " +
    'withdrawals. Running orders continue and money held in escrow stays. 409 ' +
    'ACCOUNT_ALREADY_LOCKED, 422 CANNOT_LOCK_ADMIN.',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema, body: { content: jsonContent(lockAccountBodySchema) } },
  responses: {
    200: { description: 'Locked', content: jsonContent(successResponseSchema(accountActionResultSchema)) },
    ...errorResponses(400, 401, 403, 404, 409, 422),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${BASE}/{id}/unlock`,
  tags,
  summary: 'Unlock an account with a reason; the listings the lock hid are shown again',
  description: '409 ACCOUNT_NOT_LOCKED.',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema, body: { content: jsonContent(unlockAccountBodySchema) } },
  responses: {
    200: { description: 'Unlocked', content: jsonContent(successResponseSchema(accountActionResultSchema)) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

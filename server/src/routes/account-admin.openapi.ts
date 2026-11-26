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
  trustDecisionBodySchema,
  trustDecisionResultSchema,
  trustLockBodySchema,
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
  summary: 'Counters of the tabs All, Active, Locked, New reports and Blocked by the Trust Score',
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
  summary: 'One account with its lock, violation history and Trust Score block (read-only profile)',
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

const trustDecisionResponses = {
  200: {
    description: 'Decided',
    content: jsonContent(successResponseSchema(trustDecisionResultSchema)),
  },
};

openApiRegistry.registerPath({
  method: 'post',
  path: `${BASE}/{id}/trust-block/lift`,
  tags,
  summary: 'Lift the Trust Score block of a Renter, with a reason (UC29, FE-09)',
  description:
    'Closes the open review. The Renter may then book toys whose deposit is above the limit while ' +
    'the Trust Score stays at or above its current value; a lower score ends the lift. Allowed on ' +
    'an open review or on a Renter whose score is below the threshold. Writes "user.trust_lift" ' +
    'and notifies the Renter (ACCOUNT, also by email). 409 TRUST_BLOCK_ALREADY_LIFTED, ' +
    'TRUST_BLOCK_NOT_APPLIED, TRUST_REVIEW_CHANGED.',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema, body: { content: jsonContent(trustDecisionBodySchema) } },
  responses: { ...trustDecisionResponses, ...errorResponses(400, 401, 403, 404, 409) },
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${BASE}/{id}/trust-block/keep`,
  tags,
  summary: 'Keep the Trust Score block of a Renter, with a reason (UC29, FE-09)',
  description:
    'Closes the open review; the Renter stays blocked. On a lifted Renter it puts the block back. ' +
    'A later refused booking opens a new review only once the score has changed. Writes ' +
    '"user.trust_keep" and notifies the Renter. 409 TRUST_REVIEW_NOT_OPEN, TRUST_REVIEW_CHANGED.',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema, body: { content: jsonContent(trustDecisionBodySchema) } },
  responses: { ...trustDecisionResponses, ...errorResponses(400, 401, 403, 404, 409) },
});

openApiRegistry.registerPath({
  method: 'post',
  path: `${BASE}/{id}/trust-block/lock`,
  tags,
  summary: 'Lock a Renter from the Trust Score review (7 days, 30 days or permanently)',
  description:
    'The usual lock (hides listings, ends sessions, freezes withdrawals; "user.lock" row and lock ' +
    'notice) and the open review is closed ("user.trust_lock"). 409 TRUST_REVIEW_NOT_OPEN, ' +
    'ACCOUNT_ALREADY_LOCKED, TRUST_REVIEW_CHANGED; 422 CANNOT_LOCK_ADMIN.',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema, body: { content: jsonContent(trustLockBodySchema) } },
  responses: { ...trustDecisionResponses, ...errorResponses(400, 401, 403, 404, 409, 422) },
});

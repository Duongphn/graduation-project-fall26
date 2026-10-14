import type { ZodType } from 'zod';

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
import {
  adminCancelBodySchema,
  adminConfirmReceivedBodySchema,
  adminCreateRequestBodySchema,
  adminDonationRequestDetailSchema,
  adminFiltersSchema,
  adminListQuerySchema,
  cancelBodySchema,
  confirmReceivedBodySchema,
  createRequestBodySchema,
  donationCountsSchema,
  donationRequestDetailSchema,
  donationRequestSchema,
  donorSummarySchema,
  handoverBodySchema,
  myRequestsQuerySchema,
  rejectBodySchema,
  userParamsSchema,
} from './donation_requests.schemas.js';

// Swagger for the donation flow (FE-02, BF-04). Registered when index.ts is imported.

const USER_TAG = 'Donation requests';
const ADMIN_TAG = 'Admin - Donation requests';

interface PathSpec {
  method: 'get' | 'post';
  path: string;
  tag: string;
  summary: string;
  description?: string;
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
  response: ZodType;
  paginated?: boolean;
  status?: 200 | 201;
  errors: Array<400 | 401 | 403 | 404 | 409 | 422>;
  isPublic?: boolean;
}

const register = (spec: PathSpec) =>
  openApiRegistry.registerPath({
    method: spec.method,
    path: spec.path,
    tags: [spec.tag],
    summary: spec.summary,
    ...(spec.description ? { description: spec.description } : {}),
    ...(spec.isPublic ? {} : { security: devAuthSecurity }),
    request: {
      ...(spec.params ? { params: spec.params as typeof idParamsSchema } : {}),
      ...(spec.query ? { query: spec.query as typeof idParamsSchema } : {}),
      ...(spec.body ? { body: { content: jsonContent(spec.body) } } : {}),
    },
    responses: {
      [spec.status ?? 200]: {
        description: 'Success',
        content: jsonContent(
          spec.paginated
            ? paginatedResponseSchema(spec.response)
            : successResponseSchema(spec.response),
        ),
      },
      ...errorResponses(...spec.errors),
    },
  });

const MOVE_ERRORS = [400, 401, 403, 404, 409] as Array<400 | 401 | 403 | 404 | 409>;
const userBase = '/api/v1/donation-requests';
const adminBase = '/api/v1/admin/donation-requests';

// ---- Receiver and donor ----------------------------------------------------------------------

register({
  method: 'post',
  path: userBase,
  tag: USER_TAG,
  summary: 'Receiver: request a posted DONATION toy',
  description:
    "The toy must be a DONATION post in status ACTIVE and not the caller's own. One PENDING " +
    'request per toy and requester (per organization for Admin requests). No fee, no deposit. ' +
    'Errors: 404 TOY_NOT_FOUND, 409 ' +
    'TOY_NOT_AVAILABLE / DONATION_REQUEST_EXISTS, 422 OWN_TOY.',
  body: createRequestBodySchema,
  response: donationRequestDetailSchema,
  status: 201,
  errors: [400, 401, 404, 409, 422],
});
register({
  method: 'get',
  path: `${userBase}/mine`,
  tag: USER_TAG,
  summary: 'Receiver: requests I sent',
  query: myRequestsQuerySchema,
  response: donationRequestSchema,
  paginated: true,
  errors: [400, 401],
});
register({
  method: 'get',
  path: `${userBase}/incoming`,
  tag: USER_TAG,
  summary: 'Donor: requests for my toys',
  query: myRequestsQuerySchema,
  response: donationRequestSchema,
  paginated: true,
  errors: [400, 401],
});
register({
  method: 'get',
  path: `${userBase}/{id}`,
  tag: USER_TAG,
  summary: 'Requester or donor: one request with handovers and status history',
  params: idParamsSchema,
  response: donationRequestDetailSchema,
  errors: [400, 401, 404],
});
register({
  method: 'post',
  path: `${userBase}/{id}/accept`,
  tag: USER_TAG,
  summary: 'Donor: accept (PENDING -> ACCEPTED)',
  description:
    'The toy moves ACTIVE -> RESERVED and every other PENDING request of the toy is rejected. ' +
    '409 TOY_NOT_AVAILABLE when another request was accepted first.',
  params: idParamsSchema,
  response: donationRequestDetailSchema,
  errors: MOVE_ERRORS,
});
register({
  method: 'post',
  path: `${userBase}/{id}/reject`,
  tag: USER_TAG,
  summary: 'Donor: reject with a reason (PENDING -> REJECTED)',
  params: idParamsSchema,
  body: rejectBodySchema,
  response: donationRequestDetailSchema,
  errors: MOVE_ERRORS,
});
register({
  method: 'post',
  path: `${userBase}/{id}/cancel`,
  tag: USER_TAG,
  summary: 'Requester or donor: cancel before handover',
  description:
    'PENDING or ACCEPTED -> CANCELLED. A RESERVED toy goes back to ACTIVE. Requests filed for ' +
    'an organization are cancelled on the admin route only (403 here).',
  params: idParamsSchema,
  body: cancelBodySchema,
  response: donationRequestDetailSchema,
  errors: MOVE_ERRORS,
});
register({
  method: 'post',
  path: `${userBase}/{id}/handover`,
  tag: USER_TAG,
  summary: 'Donor: hand the toy over with photos (ACCEPTED -> SHIPPING)',
  description:
    'Photos are private uploads signed with purpose HANDOVER_PHOTO by the caller ' +
    '(publicId toyflow/handovers/<caller id>/...); 422 HANDOVER_PHOTO_NOT_OWNED otherwise.',
  params: idParamsSchema,
  body: handoverBodySchema,
  response: donationRequestDetailSchema,
  errors: [...MOVE_ERRORS, 422],
});
register({
  method: 'post',
  path: `${userBase}/{id}/confirm-received`,
  tag: USER_TAG,
  summary: 'Receiving user: confirm receipt (SHIPPING -> COMPLETED, toy DONATED)',
  params: idParamsSchema,
  body: confirmReceivedBodySchema,
  response: donationRequestDetailSchema,
  errors: [...MOVE_ERRORS, 422],
});
register({
  method: 'get',
  path: '/api/v1/users/{userId}/donation-summary',
  tag: USER_TAG,
  summary: 'Public donor profile: number of completed donations',
  params: userParamsSchema,
  response: donorSummarySchema,
  errors: [400, 404],
  isPublic: true,
});

// ---- Admin -----------------------------------------------------------------------------------

register({
  method: 'get',
  path: adminBase,
  tag: ADMIN_TAG,
  summary: 'Admin: every donation request',
  description: '`q` matches the request code (prefix) or the toy title, accents ignored.',
  query: adminListQuerySchema,
  response: donationRequestSchema,
  paginated: true,
  errors: [400, 401, 403],
});
register({
  method: 'get',
  path: `${adminBase}/counts`,
  tag: ADMIN_TAG,
  summary: 'Admin: number of requests per status (same filters as the list)',
  query: adminFiltersSchema,
  response: donationCountsSchema,
  errors: [400, 401, 403],
});
register({
  method: 'post',
  path: adminBase,
  tag: ADMIN_TAG,
  summary: 'Admin: request a DONATION toy for an ACTIVE organization',
  body: adminCreateRequestBodySchema,
  response: adminDonationRequestDetailSchema,
  status: 201,
  errors: [400, 401, 403, 404, 409, 422],
});
register({
  method: 'get',
  path: `${adminBase}/{id}`,
  tag: ADMIN_TAG,
  summary: 'Admin: one request with contacts (masked), handovers and history',
  params: idParamsSchema,
  response: adminDonationRequestDetailSchema,
  errors: [400, 401, 403, 404],
});
register({
  method: 'post',
  path: `${adminBase}/{id}/accept`,
  tag: ADMIN_TAG,
  summary: 'Admin: accept (PENDING -> ACCEPTED, toy RESERVED, other PENDING rejected)',
  params: idParamsSchema,
  response: adminDonationRequestDetailSchema,
  errors: MOVE_ERRORS,
});
register({
  method: 'post',
  path: `${adminBase}/{id}/reject`,
  tag: ADMIN_TAG,
  summary: 'Admin: reject with a reason',
  params: idParamsSchema,
  body: rejectBodySchema,
  response: adminDonationRequestDetailSchema,
  errors: MOVE_ERRORS,
});
register({
  method: 'post',
  path: `${adminBase}/{id}/cancel`,
  tag: ADMIN_TAG,
  summary: 'Admin: cancel with a reason, also a stuck SHIPPING request (toy back to ACTIVE)',
  description: 'PENDING, ACCEPTED or SHIPPING -> CANCELLED (CANCELLED_BY_ADMIN), audited.',
  params: idParamsSchema,
  body: adminCancelBodySchema,
  response: adminDonationRequestDetailSchema,
  errors: MOVE_ERRORS,
});
register({
  method: 'post',
  path: `${adminBase}/{id}/confirm-received`,
  tag: ADMIN_TAG,
  summary: 'Admin: confirm receipt (SHIPPING -> COMPLETED, toy DONATED)',
  description:
    'For an organization, or for a USER receiver who does not confirm (then `reason` is ' +
    'required: 422 REASON_REQUIRED). Audited.',
  params: idParamsSchema,
  body: adminConfirmReceivedBodySchema,
  response: adminDonationRequestDetailSchema,
  errors: [...MOVE_ERRORS, 422],
});

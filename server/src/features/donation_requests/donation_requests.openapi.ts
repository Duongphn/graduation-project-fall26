import type { ZodType } from 'zod';

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
    ...(spec.isPublic ? {} : { security: bearerAuthSecurity }),
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
  summary: 'Receiver: request a posted donation toy (listingType donate)',
  description:
    "The toy must be a donation post (listingType donate) in status active and not the caller's own. One pending " +
    'request per toy and requester (per organization for Admin requests). No fee, no deposit. ' +
    'Errors: 404 TOY_NOT_FOUND, 409 ' +
    'TOY_NOT_AVAILABLE / DONATION_REQUEST_EXISTS / DONOR_LOCKED, 422 OWN_TOY.',
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
  description:
    'While accepted or shipping, `counterpartContact` gives the full name and full phone of ' +
    'the other party (Donor: the requesting user or the organization; requesting user: the ' +
    'Donor). ' +
    'null before acceptance and after completed / cancelled / rejected. 404 for anyone else.',
  params: idParamsSchema,
  response: donationRequestDetailSchema,
  errors: [400, 401, 404],
});
register({
  method: 'post',
  path: `${userBase}/{id}/accept`,
  tag: USER_TAG,
  summary: 'Donor: accept (pending -> accepted)',
  description:
    'The toy moves active -> hidden and every other pending request of the toy is rejected. ' +
    '409 TOY_NOT_AVAILABLE when another request was accepted first. Only the Donor decides ' +
    '(also for organization requests); anyone else gets 403.',
  params: idParamsSchema,
  response: donationRequestDetailSchema,
  errors: MOVE_ERRORS,
});
register({
  method: 'post',
  path: `${userBase}/{id}/reject`,
  tag: USER_TAG,
  summary: 'Donor: reject with a reason (pending -> rejected)',
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
    'pending or accepted -> cancelled. A hidden (reserved) toy goes back to active. Requests filed for ' +
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
  summary: 'Donor: hand the toy over with photos (accepted -> shipping)',
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
  summary: 'Receiving user: confirm receipt (shipping -> completed, toy DONATED)',
  description:
    'At least one photo of the received toy is required (GB-20): own HANDOVER_PHOTO uploads, ' +
    '400 VALIDATION_ERROR without photos, 422 HANDOVER_PHOTO_NOT_OWNED for foreign photos.',
  params: idParamsSchema,
  body: confirmReceivedBodySchema,
  response: donationRequestDetailSchema,
  errors: [...MOVE_ERRORS, 422],
});
register({
  method: 'get',
  path: '/api/v1/donors/{userId}/donation-summary',
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
  summary: 'Admin: request a donation toy (listingType donate) for an ACTIVE organization',
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
  summary: 'Admin: accept - always refused, the Donor decides (D-04)',
  description:
    '409 DONOR_DECISION_REQUIRED for a pending request (also an organization request an Admin ' +
    'filed); 409 INVALID_STATUS_TRANSITION for any other status, 404 for an unknown id. Admins ' +
    'resolve stuck accepted/shipping requests with cancel or confirm-received.',
  params: idParamsSchema,
  response: adminDonationRequestDetailSchema,
  errors: MOVE_ERRORS,
});
register({
  method: 'post',
  path: `${adminBase}/{id}/reject`,
  tag: ADMIN_TAG,
  summary: 'Admin: reject - always refused, the Donor decides (D-04)',
  description:
    '409 DONOR_DECISION_REQUIRED for a pending request; 409 INVALID_STATUS_TRANSITION for any ' +
    'other status. An Admin who wants a request gone cancels it (reason required, audited).',
  params: idParamsSchema,
  body: rejectBodySchema,
  response: adminDonationRequestDetailSchema,
  errors: MOVE_ERRORS,
});
register({
  method: 'post',
  path: `${adminBase}/{id}/cancel`,
  tag: ADMIN_TAG,
  summary: 'Admin: cancel with a reason, also a stuck shipping request (toy back to ACTIVE)',
  description: 'pending, accepted or shipping -> cancelled (CANCELLED_BY_ADMIN), audited.',
  params: idParamsSchema,
  body: adminCancelBodySchema,
  response: adminDonationRequestDetailSchema,
  errors: MOVE_ERRORS,
});
register({
  method: 'post',
  path: `${adminBase}/{id}/confirm-received`,
  tag: ADMIN_TAG,
  summary: 'Admin: confirm receipt (shipping -> completed, toy DONATED)',
  description:
    'For an organization, or for a USER receiver who does not confirm (then `reason` is ' +
    'required: 422 REASON_REQUIRED). Audited.',
  params: idParamsSchema,
  body: adminConfirmReceivedBodySchema,
  response: adminDonationRequestDetailSchema,
  errors: [...MOVE_ERRORS, 422],
});

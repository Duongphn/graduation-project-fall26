import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../config/openapi.js';
import {
  DISPUTE_VERDICTS,
  OWNER_DISPUTE_REASONS,
  RENTER_DISPUTE_REASONS,
} from '../constants/dispute.js';
import {
  idParamsSchema,
  isoDateTimeSchema,
  objectIdSchema,
  successResponseSchema,
} from '../validations/common.validation.js';
import { z } from '../validations/zod.js';

// Documentation only: dispute requests are checked by validations/dispute.validation.ts.

const STATUSES = ['open', 'under_review', 'resolved', 'closed'] as const;

const photoSchema = z.object({ url: z.string(), publicId: z.string() });

const payoutSchema = z.object({ renter: z.number().int(), owner: z.number().int() });

const disputeSchema = z
  .object({
    id: objectIdSchema,
    code: z.string().openapi({ example: 'DP261105AB12CD' }),
    orderType: z.literal('rental_order'),
    orderId: objectIdSchema,
    claimantId: objectIdSchema,
    respondentId: objectIdSchema,
    claimantRole: z.enum(['renter', 'owner']),
    reason: z.enum([...new Set([...RENTER_DISPUTE_REASONS, ...OWNER_DISPUTE_REASONS])] as [
      string,
      ...string[],
    ]),
    description: z.string(),
    evidencePhotos: z.array(photoSchema),
    status: z.enum(STATUSES),
    openedAt: isoDateTimeSchema,
    responseDueAt: isoDateTimeSchema.optional(),
    response: z
      .object({ message: z.string(), photos: z.array(photoSchema), respondedAt: isoDateTimeSchema })
      .optional(),
    reviewStartedAt: isoDateTimeSchema.optional(),
    responseMissed: z.boolean().optional(),
    resolution: z
      .object({
        verdict: z.enum(DISPUTE_VERDICTS),
        compensation: z.number().int(),
        reason: z.string(),
        resolvedAt: isoDateTimeSchema,
        payout: payoutSchema,
      })
      .optional(),
  })
  .openapi('Dispute');

const adminDisputeSchema = disputeSchema
  .extend({
    resolution: z
      .object({
        verdict: z.enum(DISPUTE_VERDICTS),
        compensation: z.number().int(),
        reason: z.string(),
        resolvedAt: isoDateTimeSchema,
        payout: payoutSchema.extend({ platform: z.number().int() }),
      })
      .optional(),
  })
  .openapi('AdminDispute');

const partySchema = z.object({
  id: objectIdSchema,
  fullName: z.string(),
  avatar: z.string().optional(),
  trustScore: z.number().optional(),
  verified: z.boolean(),
});

const caseFileSchema = z
  .object({
    dispute: adminDisputeSchema,
    claimant: partySchema,
    respondent: partySchema,
    caseFile: z.object({
      order: z
        .object({})
        .passthrough()
        .openapi({ description: 'RentalOrderDto; photos in handover and returnInfo' }),
      history: z.array(
        z.object({
          oldStatus: z.string().optional(),
          newStatus: z.string(),
          changedBy: objectIdSchema,
          notes: z.string().optional(),
          occurredAt: isoDateTimeSchema,
        }),
      ),
      amounts: z.object({
        rentalFee: z.number().int(),
        depositAmount: z.number().int(),
        platformFee: z.number().int(),
        lateFee: z.number().int(),
      }),
    }),
    compensationCap: z.number().int(),
    conversation: z.null(),
    aiAssessment: z.null(),
  })
  .openapi('AdminDisputeCase');

const pageOf = (item: z.ZodType) =>
  successResponseSchema(
    z.object({
      items: z.array(item),
      total: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
    }),
  );

const pageQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
};

const multipart = (fields: Record<string, z.ZodType>, photos: string) => ({
  content: {
    'multipart/form-data': {
      schema: z.object({
        ...fields,
        photos: z.array(z.string().openapi({ format: 'binary' })).openapi({ description: photos }),
      }),
    },
  },
});

const userTags = ['Disputes'];
const adminTags = ['Admin - Disputes'];

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/rentals/{id}/disputes',
  tags: userTags,
  summary: 'Open the dispute of a rental order (UC17)',
  description:
    'Renter: IN_USE, within 24h of rentalStartedAt. Owner: RETURNING, before the SETTLEMENT timer. ' +
    'Order goes to DISPUTING, escrow stays held. 400 COMPLAINT_WINDOW_CLOSED, 409 DISPUTE_ALREADY_EXISTS, ' +
    '409 INVALID_RENTAL_TRANSITION, 400 INVALID_IMAGE_UPLOAD.',
  security: bearerAuthSecurity,
  request: {
    params: idParamsSchema,
    body: multipart(
      { reason: z.string(), description: z.string().min(10).max(1000) },
      '1 to 10 images',
    ),
  },
  responses: {
    201: {
      description: 'Dispute opened',
      content: jsonContent(
        successResponseSchema(
          z.object({ dispute: disputeSchema, order: z.object({}).passthrough() }),
        ),
      ),
    },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/disputes',
  tags: userTags,
  summary: 'My disputes (claimant or respondent), newest first',
  security: bearerAuthSecurity,
  request: {
    query: z.object({
      role: z.enum(['claimant', 'respondent']).optional(),
      status: z.enum(STATUSES).optional(),
      ...pageQuery,
    }),
  },
  responses: {
    200: { description: 'One page of disputes', content: jsonContent(pageOf(disputeSchema)) },
    ...errorResponses(400, 401),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/disputes/{id}',
  tags: userTags,
  summary: 'One of my disputes (404 for anyone else)',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: {
    200: { description: 'The dispute', content: jsonContent(successResponseSchema(disputeSchema)) },
    ...errorResponses(401, 404),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/disputes/{id}/response',
  tags: userTags,
  summary: 'Answer a dispute once, within 72 hours (UC18)',
  description:
    'Respondent only (claimant: 403 FORBIDDEN_RENTAL_ACTION). Dispute goes to under_review. ' +
    '409 DISPUTE_NOT_OPEN, 400 RESPONSE_WINDOW_CLOSED.',
  security: bearerAuthSecurity,
  request: {
    params: idParamsSchema,
    body: multipart({ message: z.string().min(10).max(1000) }, '0 to 10 images'),
  },
  responses: {
    200: {
      description: 'Dispute under review',
      content: jsonContent(successResponseSchema(disputeSchema)),
    },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/admin/disputes',
  tags: adminTags,
  summary: 'Dispute queue (UC19)',
  description:
    'Default status under_review, oldest reviewStartedAt first; other statuses newest openedAt first.',
  security: bearerAuthSecurity,
  request: { query: z.object({ status: z.enum(STATUSES).optional(), ...pageQuery }) },
  responses: {
    200: { description: 'One page of disputes', content: jsonContent(pageOf(adminDisputeSchema)) },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/admin/disputes/{id}',
  tags: adminTags,
  summary: 'Case file: dispute, both parties, order photos, timeline, amounts and cap',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'The case file',
      content: jsonContent(successResponseSchema(caseFileSchema)),
    },
    ...errorResponses(401, 403, 404),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/admin/disputes/{id}/resolve',
  tags: adminTags,
  summary: 'Issue the verdict once; splits the escrow and completes the order',
  description:
    'RESPONDENT_FAVORED needs compensation 0, the other verdicts more than 0 (when the cap is 0, ' +
    'every verdict takes 0). 400 COMPENSATION_TOO_HIGH (details.max), 400 VALIDATION_ERROR, ' +
    '409 DISPUTE_NOT_UNDER_REVIEW (also for a second verdict).',
  security: bearerAuthSecurity,
  request: {
    params: idParamsSchema,
    body: {
      content: jsonContent(
        z.object({
          verdict: z.enum(DISPUTE_VERDICTS),
          compensation: z.number().int().min(0),
          reason: z.string().trim().min(30).max(500),
        }),
      ),
    },
  },
  responses: {
    200: {
      description: 'Dispute resolved',
      content: jsonContent(successResponseSchema(adminDisputeSchema)),
    },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

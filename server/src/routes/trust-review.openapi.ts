import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../config/openapi.js';
import {
  isoDateTimeSchema,
  objectIdSchema,
  successResponseSchema,
} from '../validations/common.validation.js';
import { z } from '../validations/zod.js';

// Documentation only: requests are checked by validations/trust-review.validation.ts.

const reviewerSchema = z.object({
  id: objectIdSchema,
  fullName: z.string(),
  avatar: z.string().optional(),
});

const itemShape = {
  userId: objectIdSchema,
  fullName: z.string(),
  phone: z.string().openapi({ description: 'Masked.' }),
  score: z.number().int().min(0).max(100).nullable(),
  reviewCount: z.number().int(),
  ratingAverage: z.number().nullable(),
  cancellations: z.number().int(),
  requestedAt: isoDateTimeSchema.nullable(),
  lastBlocked: z
    .object({
      attemptAt: isoDateTimeSchema,
      toyId: objectIdSchema,
      toyTitle: z.string().nullable(),
      depositAmount: z.number().int(),
    })
    .nullable(),
};

const queueItemSchema = z
  .object({ ...itemShape, disputesLost: z.number().int() })
  .openapi('TrustQueueItem');

const detailSchema = z
  .object({
    ...itemShape,
    disputesLostCount: z.number().int(),
    override: z
      .object({
        allowedUntil: isoDateTimeSchema,
        decidedBy: objectIdSchema,
        decidedAt: isoDateTimeSchema,
      })
      .nullable(),
    lastDecision: z
      .object({
        decision: z.enum(['ALLOW', 'KEEP_RESTRICTED']),
        reason: z.string(),
        scoreAtDecision: z.number().int().nullable(),
        decidedBy: objectIdSchema,
        decidedAt: isoDateTimeSchema,
      })
      .nullable(),
    reviews: z.array(
      z.object({
        id: objectIdSchema,
        direction: z.enum(['RENTER_TO_OWNER', 'OWNER_TO_RENTER']),
        reviewer: reviewerSchema,
        userRating: z.number().int(),
        toyRating: z.number().int().optional(),
        comment: z.string().optional(),
        createdAt: isoDateTimeSchema,
      }),
    ),
    expiredOrders: z.array(
      z.object({ orderId: objectIdSchema, code: z.string(), expiredAt: isoDateTimeSchema }),
    ),
    disputesLost: z.array(
      z.object({
        disputeId: objectIdSchema,
        code: z.string(),
        verdict: z.string(),
        resolvedAt: isoDateTimeSchema,
      }),
    ),
  })
  .openapi('TrustReviewDetail');

const tags = ['Admin - Trust Reviews'];
const userIdParams = z.object({ userId: objectIdSchema });

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/admin/trust-reviews',
  tags,
  summary: 'Queue of renters blocked by the Trust Score, oldest request first (UC24)',
  security: bearerAuthSecurity,
  request: {
    query: z.object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
    }),
  },
  responses: {
    200: {
      description: 'One page of queue items',
      content: jsonContent(
        successResponseSchema(
          z.object({
            items: z.array(queueItemSchema),
            total: z.number().int(),
            page: z.number().int(),
            limit: z.number().int(),
          }),
        ),
      ),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/admin/trust-reviews/{userId}',
  tags,
  summary: 'Trust Score evidence of one user (recomputed on read)',
  security: bearerAuthSecurity,
  request: { params: userIdParams },
  responses: {
    200: { description: 'The evidence', content: jsonContent(successResponseSchema(detailSchema)) },
    ...errorResponses(401, 403, 404),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/admin/trust-reviews/{userId}/decision',
  tags,
  summary: 'ALLOW (override for trustOverrideDays) or KEEP_RESTRICTED (UC24)',
  description:
    'Only for a user still in the queue: 409 TRUST_REVIEW_NOT_PENDING otherwise. ' +
    'The user is notified and the decision is audit-logged.',
  security: bearerAuthSecurity,
  request: {
    params: userIdParams,
    body: {
      content: jsonContent(
        z.object({
          decision: z.enum(['ALLOW', 'KEEP_RESTRICTED']),
          reason: z.string().min(10).max(500),
        }),
      ),
    },
  },
  responses: {
    200: {
      description: 'The updated evidence',
      content: jsonContent(successResponseSchema(detailSchema)),
    },
    ...errorResponses(400, 401, 403, 404, 409),
  },
});

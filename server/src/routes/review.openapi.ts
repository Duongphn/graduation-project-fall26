import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../config/openapi.js';
import {
  idParamsSchema,
  isoDateTimeSchema,
  objectIdSchema,
  successResponseSchema,
} from '../validations/common.validation.js';
import { z } from '../validations/zod.js';

// Documentation only: requests are checked by validations/review.validation.ts.

const reviewSchema = z
  .object({
    id: objectIdSchema,
    direction: z.enum(['RENTER_TO_OWNER', 'OWNER_TO_RENTER']),
    reviewer: z.object({
      id: objectIdSchema,
      fullName: z.string(),
      avatar: z.string().optional(),
    }),
    userRating: z.number().int().min(1).max(5),
    toyRating: z.number().int().min(1).max(5).optional(),
    comment: z.string().optional(),
    createdAt: isoDateTimeSchema,
  })
  .openapi('Review');

const orderReviewsSchema = z
  .object({
    myReview: reviewSchema.nullable(),
    theirReview: reviewSchema.nullable(),
    canReview: z.boolean(),
    reviewDeadline: isoDateTimeSchema.nullable(),
  })
  .openapi('OrderReviews');

const pageOf = (item: z.ZodType) =>
  successResponseSchema(
    z.object({
      items: z.array(item),
      total: z.number().int(),
      page: z.number().int(),
      limit: z.number().int(),
    }),
  );

const listQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
};

const submitBody = z.object({
  userRating: z.number().int().min(1).max(5),
  toyRating: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .openapi({ description: 'Required for the Renter, not allowed for the Owner.' }),
  comment: z.string().max(1000).optional(),
});

const tags = ['Reviews'];

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/rentals/{id}/reviews',
  tags,
  summary: 'Review the other party of a completed rental order (UC24)',
  description:
    'Each party reviews once, within reviewWindowDays of settlement. 400 VALIDATION_ERROR, ' +
    '400 CONTACT_DETAILS_NOT_ALLOWED, 404 RENTAL_NOT_FOUND (also for non-parties), ' +
    '409 ORDER_NOT_COMPLETED, 409 REVIEW_WINDOW_CLOSED, 409 ALREADY_REVIEWED.',
  security: bearerAuthSecurity,
  request: {
    params: idParamsSchema,
    body: { content: jsonContent(submitBody) },
  },
  responses: {
    201: { description: 'Review saved', content: jsonContent(successResponseSchema(reviewSchema)) },
    ...errorResponses(400, 401, 404, 409),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/rentals/{id}/reviews',
  tags,
  summary: 'Both reviews of a rental order and whether I can still review',
  security: bearerAuthSecurity,
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'My review, their review, canReview and the deadline',
      content: jsonContent(successResponseSchema(orderReviewsSchema)),
    },
    ...errorResponses(401, 404),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/toys/{id}/reviews',
  tags,
  summary: 'Public reviews of a toy, newest first',
  description: 'Only reviews written by renters. 404 TOY_NOT_FOUND unless the toy is active.',
  request: { params: idParamsSchema, query: z.object(listQuery) },
  responses: {
    200: { description: 'One page of reviews', content: jsonContent(pageOf(reviewSchema)) },
    ...errorResponses(400, 404),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/users/{id}/reviews',
  tags,
  summary: 'Public reviews a user received, newest first',
  description:
    'role=owner: received as owner; role=renter: received as renter. 404 USER_NOT_FOUND.',
  request: {
    params: idParamsSchema,
    query: z.object({ role: z.enum(['owner', 'renter']).optional(), ...listQuery }),
  },
  responses: {
    200: { description: 'One page of reviews', content: jsonContent(pageOf(reviewSchema)) },
    ...errorResponses(400, 404),
  },
});

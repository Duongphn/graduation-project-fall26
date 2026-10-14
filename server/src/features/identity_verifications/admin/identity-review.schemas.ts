import {
  identityStatuses,
  userStatuses,
  verificationStatuses,
} from '../../../shared/domain/statuses.js';
import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQuerySchema,
  reasonSchema,
  searchQuerySchema,
} from '../../../shared/http/schemas.js';
import { z } from '../../../shared/validation/zod.js';

// Admin review of identity verifications (UC27 identity part, FE-01, LI-04: no eKYC).

export const verificationStatusSchema = z.enum(verificationStatuses);

export const identityQueueQuerySchema = paginationQuerySchema
  .extend({
    status: verificationStatusSchema.default('PENDING').openapi({
      description: 'Tab of the queue. Pending requests are listed oldest first.',
    }),
    q: searchQuerySchema.openapi({
      description: 'Full name (with or without accents), email prefix or phone number.',
      example: 'Nguyễn Văn An',
    }),
    sortBy: z.enum(['createdAt', 'reviewedAt']).optional().openapi({
      description: 'Default: createdAt ascending for PENDING, reviewedAt descending otherwise.',
    }),
  })
  .strict();
export type IdentityQueueQuery = z.infer<typeof identityQueueQuerySchema>;

export const rejectIdentityBodySchema = z
  .object({ reason: reasonSchema })
  .strict()
  .openapi('RejectIdentityVerificationBody');
export type RejectIdentityBody = z.infer<typeof rejectIdentityBodySchema>;

// Response shapes, used for Swagger and checked by the tests.

const queueUserSchema = z.object({
  id: objectIdSchema,
  fullName: z.string(),
  // GB-35: masked on Admin screens.
  maskedPhone: z.string().openapi({ example: '+8491***5678' }),
  maskedEmail: z.string().openapi({ example: 'ng***@gmail.com' }),
  age: z.number().int().nullable().openapi({ description: 'Null when no date of birth.' }),
});

export const identityQueueItemSchema = z
  .object({
    id: objectIdSchema,
    status: verificationStatusSchema,
    submittedAt: isoDateTimeSchema,
    reviewedAt: isoDateTimeSchema.nullable(),
    rejectReason: z.string().nullable(),
    user: queueUserSchema.nullable(),
    previousAttempts: z.number().int().openapi({
      description: 'Number of requests the same user sent before this one.',
    }),
  })
  .openapi('AdminIdentityQueueItem');

export const identityCountsSchema = z
  .object({ PENDING: z.number().int(), VERIFIED: z.number().int(), REJECTED: z.number().int() })
  .openapi('AdminIdentityCounts');

const documentLinkSchema = z
  .object({ url: z.string(), expiresAt: isoDateTimeSchema })
  .nullable()
  .openapi({
    description:
      'Signed Cloudinary link valid for 5 minutes (R04 III.1.3). Null when the request is ' +
      'already decided or Cloudinary is not configured; the stored asset is never exposed.',
  });

export const identityDetailSchema = z
  .object({
    id: objectIdSchema,
    status: verificationStatusSchema,
    submittedAt: isoDateTimeSchema,
    reviewedAt: isoDateTimeSchema.nullable(),
    reviewedBy: objectIdSchema.nullable(),
    rejectReason: z.string().nullable(),
    user: queueUserSchema
      .extend({
        dateOfBirth: isoDateTimeSchema.nullable(),
        identityStatus: z.enum(identityStatuses),
        accountStatus: z.enum(userStatuses),
        locked: z.boolean(),
        joinedAt: isoDateTimeSchema,
      })
      .nullable(),
    documents: z.object({
      frontImage: documentLinkSchema,
      backImage: documentLinkSchema,
      selfieImage: documentLinkSchema,
    }),
    previewAvailable: z.boolean().openapi({
      description: 'True when all three links were signed (PENDING and Cloudinary configured).',
    }),
    previewExpiresAt: isoDateTimeSchema.nullable().openapi({
      description: 'Earliest expiry of the three links; refetch before it to get new links.',
    }),
    previousRequests: z.array(
      z.object({
        id: objectIdSchema,
        status: verificationStatusSchema,
        submittedAt: isoDateTimeSchema,
        reviewedAt: isoDateTimeSchema.nullable(),
        rejectReason: z.string().nullable(),
      }),
    ),
  })
  .openapi('AdminIdentityDetail');

export const identityReviewResultSchema = z
  .object({
    id: objectIdSchema,
    status: verificationStatusSchema,
    reviewedAt: isoDateTimeSchema,
    rejectReason: z.string().nullable(),
    user: z.object({ id: objectIdSchema, identityStatus: z.enum(identityStatuses) }),
  })
  .openapi('AdminIdentityReviewResult');

import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQuerySchema,
  reasonSchema,
  searchQuerySchema,
} from './common.validation.js';
import { z } from './zod.js';
import { verificationStatuses } from '../constants/identity-review-transitions.js';

const userVerificationStatuses = ['unverified', 'pending', 'verified', 'rejected'] as const;

// Admin review of identity verifications (UC27 identity part, FE-01, LI-04: no eKYC).

export const verificationStatusSchema = z.enum(verificationStatuses);

export const identityQueueQuerySchema = paginationQuerySchema
  .extend({
    status: verificationStatusSchema.default('pending').openapi({
      description: 'Tab of the queue. Pending requests are listed oldest first.',
    }),
    q: searchQuerySchema.openapi({
      description: 'Full name (with or without accents), email prefix or phone number.',
      example: 'Nguyễn Văn An',
    }),
    sortBy: z.enum(['submittedAt', 'reviewedAt']).optional().openapi({
      description: 'Default: submittedAt ascending for pending, reviewedAt descending otherwise.',
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
});

export const identityQueueItemSchema = z
  .object({
    id: objectIdSchema,
    status: verificationStatusSchema,
    submittedAt: isoDateTimeSchema,
    reviewedAt: isoDateTimeSchema.nullable(),
    rejectionReason: z.string().nullable(),
    user: queueUserSchema.nullable(),
    previousAttempts: z.number().int().openapi({
      description: 'Number of requests the same user sent before this one.',
    }),
  })
  .openapi('AdminIdentityQueueItem');

export const identityCountsSchema = z
  .object({ pending: z.number().int(), verified: z.number().int(), rejected: z.number().int() })
  .openapi('AdminIdentityCounts');

const documentLinkSchema = z
  .object({ url: z.string(), expiresAt: isoDateTimeSchema })
  .nullable()
  .openapi({
    description:
      'Authorized Cloudinary link (develop IdentityImageStorage). Null when the request is ' +
      'already decided or Cloudinary is not configured; the stored asset is never exposed.',
  });

export const identityDetailSchema = z
  .object({
    id: objectIdSchema,
    status: verificationStatusSchema,
    submittedAt: isoDateTimeSchema,
    reviewedAt: isoDateTimeSchema.nullable(),
    reviewedBy: objectIdSchema.nullable(),
    phone: z.string(),
    idCardNumber: z.string(),
    rejectionReason: z.string().nullable(),
    user: queueUserSchema
      .extend({
        verificationStatus: z.enum(userVerificationStatuses),
        accountStatus: z.enum(['ACTIVE', 'LOCKED']),
        locked: z.boolean(),
        joinedAt: isoDateTimeSchema,
      })
      .nullable(),
    documents: z.object({
      frontImage: documentLinkSchema,
      backImage: documentLinkSchema,
      selfie: documentLinkSchema,
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
        rejectionReason: z.string().nullable(),
      }),
    ),
  })
  .openapi('AdminIdentityDetail');

export const identityReviewResultSchema = z
  .object({
    id: objectIdSchema,
    status: verificationStatusSchema,
    reviewedAt: isoDateTimeSchema,
    rejectionReason: z.string().nullable(),
    user: z.object({ id: objectIdSchema, verificationStatus: z.enum(userVerificationStatuses) }),
  })
  .openapi('AdminIdentityReviewResult');

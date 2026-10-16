import { ageGroups, listingTypes, toyConditions } from '../../shared/domain/enums.js';
import {
  identityStatuses,
  toyStatuses,
  userStatuses,
  visibilityStatuses,
} from '../../shared/domain/statuses.js';
import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQueryWithSort,
  reasonSchema,
  searchQuerySchema,
} from '../../shared/http/schemas.js';
import { z } from '../../shared/validation/zod.js';

// Admin moderation of toy posts (UC27, FE-03, GB-08): request and response schemas. The same
// schemas validate the requests and document them in Swagger (api-conventions.md §4).

/** Fields the queue can be sorted on (another sortBy is a 400). */
export const toyModerationSortFields = [
  'moderation.submittedAt',
  'createdAt',
  'updatedAt',
  'title',
] as const;

const filterShape = {
  listingType: z.enum(listingTypes).optional(),
  categoryId: objectIdSchema.optional(),
  q: searchQuerySchema.openapi({
    description: 'Words of the title or description, or the id of a post.',
  }),
};

export const toyModerationQueueQuerySchema = paginationQueryWithSort(toyModerationSortFields)
  .extend({ status: z.enum(toyStatuses).default('PENDING_REVIEW'), ...filterShape })
  .strict();
export type ToyModerationQueueQuery = z.infer<typeof toyModerationQueueQuerySchema>;

export const toyModerationCountsQuerySchema = z.object(filterShape).strict();
export type ToyModerationCountsQuery = z.infer<typeof toyModerationCountsQuerySchema>;

// The `updatedAt` of the post the Admin looked at (required). When the Owner has edited the post
// since, the decision is refused, so an Admin never approves content they have not seen (FE-03).
const expectedUpdatedAtField = isoDateTimeSchema.openapi({
  description: 'updatedAt of the post as shown to the Admin (stale-edit token).',
});

export const approveToyBodySchema = z
  .object({ expectedUpdatedAt: expectedUpdatedAtField })
  .strict()
  .openapi('ApproveToyRequest');
export type ApproveToyBody = z.infer<typeof approveToyBodySchema>;

export const rejectToyBodySchema = z
  .object({ expectedUpdatedAt: expectedUpdatedAtField, reason: reasonSchema })
  .strict()
  .openapi('RejectToyRequest');
export type RejectToyBody = z.infer<typeof rejectToyBodySchema>;

// ---- Responses ----

const categorySummarySchema = z
  .object({ id: z.string(), name: z.string(), status: z.enum(visibilityStatuses) })
  .openapi('ModerationCategorySummary');

const ownerSummarySchema = z
  .object({
    id: z.string(),
    fullName: z.string(),
    maskedPhone: z.string().openapi({ example: '+8490***4567' }),
    identityStatus: z.enum(identityStatuses),
  })
  .openapi('ModerationOwnerSummary');

const pricingSchema = z.object({
  rentPerDay: z.number().nullable(),
  deposit: z.number().nullable(),
  salePrice: z.number().nullable(),
});

export const toyModerationListItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    listingType: z.enum(listingTypes),
    status: z.enum(toyStatuses),
    condition: z.enum(toyConditions),
    ageGroup: z.enum(ageGroups),
    pricing: pricingSchema,
    area: z.string().nullable(),
    coverImage: z.string().nullable(),
    imageCount: z.number().int(),
    category: categorySummarySchema.nullable(),
    owner: ownerSummarySchema.nullable(),
    moderation: z.object({
      submittedAt: isoDateTimeSchema,
      rejectReason: z.string().nullable(),
    }),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .openapi('ToyModerationListItem');
export type ToyModerationListItem = z.infer<typeof toyModerationListItemSchema>;

export const toyStatusCountsSchema = z
  .record(z.enum(toyStatuses), z.number().int())
  .openapi('ToyStatusCounts', {
    example: {
      PENDING_REVIEW: 4,
      ACTIVE: 20,
      REJECTED: 2,
      RESERVED: 1,
      HIDDEN: 1,
      SOLD: 3,
      DONATED: 0,
    },
  });
export type ToyStatusCounts = z.infer<typeof toyStatusCountsSchema>;

export const moderationWarningCodes = [
  'CATEGORY_MISSING',
  'CATEGORY_HIDDEN',
  'OWNER_MISSING',
  'OWNER_UNVERIFIED',
  'OWNER_LOCKED',
  'OWNER_AGE_UNKNOWN',
  'OWNER_UNDER_AGE',
  'TOO_FEW_PHOTOS',
  'CONTACT_PHONE',
  'CONTACT_BANK_ACCOUNT',
  'CONTACT_LINK',
] as const;
export type ModerationWarningCode = (typeof moderationWarningCodes)[number];

export const moderationWarningSchema = z
  .object({ code: z.enum(moderationWarningCodes), message: z.string() })
  .openapi('ModerationWarning');
export type ModerationWarning = z.infer<typeof moderationWarningSchema>;

export const toyModerationDetailSchema = toyModerationListItemSchema
  .extend({
    description: z.string(),
    images: z.array(z.string()),
    minPhotos: z.number().int().openapi({ description: 'TOY_MIN_PHOTOS_* for this type.' }),
    minAgeYears: z.number().int().openapi({ description: 'USER_MIN_AGE_YEARS.' }),
    owner: ownerSummarySchema
      .extend({
        accountStatus: z.enum(userStatuses).openapi({
          description: 'LOCKED also while a temporary lock (lock.until) is running.',
        }),
        lockedUntil: isoDateTimeSchema.nullable(),
        age: z.number().int().nullable().openapi({ description: 'Years, from dateOfBirth.' }),
        trustScore: z.number().nullable().openapi({ description: 'ratingSum / ratingCount.' }),
        ratingCount: z.number().int(),
        memberSince: isoDateTimeSchema,
      })
      .nullable(),
    moderation: z.object({
      submittedAt: isoDateTimeSchema,
      rejectReason: z.string().nullable(),
      reviewedBy: z.object({ id: z.string(), fullName: z.string().nullable() }).nullable(),
      reviewedAt: isoDateTimeSchema.nullable(),
    }),
    warnings: z.array(moderationWarningSchema).openapi({
      description: 'Rule-based hints for the Admin; the Admin still decides (LI-03).',
    }),
  })
  .openapi('ToyModerationDetail');
export type ToyModerationDetail = z.infer<typeof toyModerationDetailSchema>;

export const toyModerationDecisionSchema = z
  .object({
    id: z.string(),
    status: z.enum(['ACTIVE', 'REJECTED']),
    updatedAt: isoDateTimeSchema,
    moderation: z.object({
      reviewedBy: z.string(),
      reviewedAt: isoDateTimeSchema,
      rejectReason: z.string().nullable(),
    }),
  })
  .openapi('ToyModerationDecision');
export type ToyModerationDecision = z.infer<typeof toyModerationDecisionSchema>;

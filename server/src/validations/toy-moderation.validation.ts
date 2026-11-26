import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQueryWithSort,
  reasonSchema,
  searchQuerySchema,
} from './common.validation.js';
import { z } from './zod.js';

// Values stored by develop's toys / users models.
export const moderationToyStatuses = ['pending', 'active', 'hidden'] as const;
export type ModerationToyStatus = (typeof moderationToyStatuses)[number];
export const moderationListingTypes = ['rent', 'sell', 'donate'] as const;
export type ModerationListingType = (typeof moderationListingTypes)[number];
const verificationStatuses = ['unverified', 'pending', 'verified', 'rejected'] as const;

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
  listingType: z.enum(moderationListingTypes).optional(),
  categoryId: objectIdSchema.optional(),
  q: searchQuerySchema.openapi({
    description: 'Words of the title or description, or the id of a post.',
  }),
};

export const toyModerationQueueQuerySchema = paginationQueryWithSort(toyModerationSortFields)
  .extend({ status: z.enum(moderationToyStatuses).default('pending'), ...filterShape })
  .strict();
export type ToyModerationQueueQuery = z.infer<typeof toyModerationQueueQuerySchema>;

export const toyModerationCountsQuerySchema = z.object(filterShape).strict();
export type ToyModerationCountsQuery = z.infer<typeof toyModerationCountsQuerySchema>;

// The `updatedAt` of the post the Admin looked at (required). When the Owner has edited the post
// since, the decision is refused, so an Admin never approves content they have not seen (FE-03).
const expectedUpdatedAtField = isoDateTimeSchema.openapi({
  description: 'updatedAt of the post as shown to the Admin (stale-edit token).',
});

// The Admin safety checklist of UC27 (R03 II.7.2, GB-48). Every item must be ticked before a post
// is approved; rejecting needs no checklist. The ticks are stored as moderation.safetyChecklist.
export const safetyChecklistItems = [
  'photosShowWholeToy',
  'ageFitsSmallParts',
  'batteryCompartmentSecured',
  'notRecalledOrBanned',
  'noHiddenDefect',
] as const;
export type SafetyChecklistItem = (typeof safetyChecklistItems)[number];

const tickedSchema = z.literal(true, {
  error: 'Admin phải đánh dấu đủ các mục kiểm tra an toàn trước khi duyệt.',
});

export const safetyChecklistSchema = z
  .object(
    {
      photosShowWholeToy: tickedSchema.openapi({
        description: 'The photos show the whole toy, with no broken or sharp parts.',
      }),
      ageFitsSmallParts: tickedSchema.openapi({
        description: 'The age range fits the small parts, magnets and batteries (GB-45).',
      }),
      batteryCompartmentSecured: tickedSchema.openapi({
        description: 'A battery compartment, if any, is closed with a screw.',
      }),
      notRecalledOrBanned: tickedSchema.openapi({
        description: 'The toy is not a known recalled or banned toy (GB-47).',
      }),
      noHiddenDefect: tickedSchema.openapi({
        description: 'The description does not hide a known defect.',
      }),
    },
    { error: 'Admin phải đánh dấu đủ các mục kiểm tra an toàn trước khi duyệt.' },
  )
  .strict()
  .openapi('ToySafetyChecklist');
export type SafetyChecklist = z.infer<typeof safetyChecklistSchema>;

export const approveToyBodySchema = z
  .object({ expectedUpdatedAt: expectedUpdatedAtField, safetyChecklist: safetyChecklistSchema })
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
  .object({ id: z.string(), name: z.string(), status: z.enum(['active', 'hidden']) })
  .openapi('ModerationCategorySummary');

const ownerSummarySchema = z
  .object({
    id: z.string(),
    fullName: z.string(),
    maskedPhone: z.string().openapi({ example: '+8490***4567' }),
    verificationStatus: z.enum(verificationStatuses),
  })
  .openapi('ModerationOwnerSummary');

export const toyModerationListItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    listingType: z.enum(moderationListingTypes),
    status: z.enum(moderationToyStatuses),
    condition: z.string(),
    ageRange: z.object({ minAge: z.number(), maxAge: z.number() }),
    priceOrRate: z.number(),
    depositPrice: z.number().nullable(),
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
  .record(z.enum(moderationToyStatuses), z.number().int())
  .openapi('ToyStatusCounts', { example: { pending: 4, active: 20, hidden: 2 } });
export type ToyStatusCounts = z.infer<typeof toyStatusCountsSchema>;

export const moderationWarningCodes = [
  'CATEGORY_MISSING',
  'CATEGORY_HIDDEN',
  'OWNER_MISSING',
  'OWNER_UNVERIFIED',
  'OWNER_LOCKED',
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
    images: z.array(z.object({ url: z.string(), publicId: z.string() })),
    minPhotos: z.number().int(),
    owner: ownerSummarySchema
      .extend({
        accountStatus: z.enum(['ACTIVE', 'LOCKED']).openapi({
          description: 'LOCKED also while a temporary lock (lock.until) is running.',
        }),
        lockedUntil: isoDateTimeSchema.nullable(),
        trustScore: z.number().nullable().openapi({ description: 'users.trust.score.' }),
        memberSince: isoDateTimeSchema,
      })
      .nullable(),
    moderation: z.object({
      submittedAt: isoDateTimeSchema,
      rejectReason: z.string().nullable(),
      reviewedBy: z.object({ id: z.string(), fullName: z.string().nullable() }).nullable(),
      reviewedAt: isoDateTimeSchema.nullable(),
      safetyChecklist: z
        .record(z.enum(safetyChecklistItems), z.boolean())
        .nullable()
        .openapi({ description: 'The ticks the approving Admin gave; null before approval.' }),
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
    status: z.enum(['active', 'hidden']),
    updatedAt: isoDateTimeSchema,
    moderation: z.object({
      reviewedBy: z.string(),
      reviewedAt: isoDateTimeSchema,
      rejectReason: z.string().nullable(),
    }),
  })
  .openapi('ToyModerationDecision');
export type ToyModerationDecision = z.infer<typeof toyModerationDecisionSchema>;

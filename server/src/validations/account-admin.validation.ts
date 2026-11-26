import { disputeRulings } from '../constants/dispute-ruling.js';
import { trustDecisionActions } from '../constants/trust-review.js';
import { lockDurations, reportActions } from '../constants/violation-report.js';
import {
  isoDateTimeSchema,
  paginationQueryWithSort,
  searchQuerySchema,
} from './common.validation.js';
import { z } from './zod.js';

// Admin account management (UC29, R03 III.7.2.1): list, detail, lock and unlock with a reason.

export const accountListTabs = ['all', 'active', 'locked', 'reported', 'trust_review'] as const;
export type AccountListTab = (typeof accountListTabs)[number];

export const accountSortFields = ['createdAt', 'violationCount'] as const;

/**
 * Trust Score bands of the User List (R03 III.7.2.1 (2)), from GB-29: the score goes from 0 to
 * 100 and starts at 100; below 50 a Renter cannot rent toys with a high deposit.
 */
export const accountTrustBands = ['low', 'medium', 'full'] as const;
export type AccountTrustBand = (typeof accountTrustBands)[number];

const accountFilterShape = {
  role: z.enum(['USER', 'ADMIN']).optional(),
  trustBand: z.enum(accountTrustBands).optional().openapi({
    description: 'low = below 50, medium = 50 to 99, full = 100 (also an account not scored yet).',
  }),
  q: searchQuerySchema.openapi({ description: 'Name, phone number or email.' }),
};

export const accountListQuerySchema = paginationQueryWithSort(accountSortFields)
  .extend({
    tab: z.enum(accountListTabs).default('all').openapi({
      description:
        'all, active, locked, reported = users with pending reports ("New reports"), or ' +
        'trust_review = Renters blocked by a low Trust Score who wait for an Admin (UC29, FE-09).',
    }),
    ...accountFilterShape,
  })
  .strict();
export type AccountListQuery = z.infer<typeof accountListQuerySchema>;

export const accountCountsQuerySchema = z.object(accountFilterShape).strict();
export type AccountCountsQuery = z.infer<typeof accountCountsQuerySchema>;

/** R03 III.7.2.1 (9): every lock or unlock has a reason of 20 to 300 characters. */
const accountReasonSchema = z.string().trim().min(20).max(300).openapi({
  example: 'Nhiều lần đăng tin đồ chơi không an toàn sau khi đã bị cảnh cáo.',
});

export const lockAccountBodySchema = z
  .object({ duration: z.enum(lockDurations), reason: accountReasonSchema })
  .strict()
  .openapi('LockAccountRequest');
export type LockAccountBody = z.infer<typeof lockAccountBodySchema>;

export const unlockAccountBodySchema = z
  .object({ reason: accountReasonSchema })
  .strict()
  .openapi('UnlockAccountRequest');
export type UnlockAccountBody = z.infer<typeof unlockAccountBodySchema>;

const accountStatusSchema = z.enum(['ACTIVE', 'LOCKED']).openapi({
  description: 'LOCKED while an Admin lock runs (a permanent one, or until lockedUntil).',
});

export const accountListItemSchema = z
  .object({
    id: z.string(),
    fullName: z.string(),
    avatar: z.string().nullable(),
    maskedPhone: z.string(),
    maskedEmail: z.string(),
    role: z.enum(['USER', 'ADMIN']),
    accountStatus: accountStatusSchema,
    lockedUntil: isoDateTimeSchema.nullable(),
    verificationStatus: z.enum(['unverified', 'pending', 'verified', 'rejected']),
    trustScore: z.number().nullable().openapi({
      description: 'users.trust.score; 100 for an account not scored yet (GB-29).',
    }),
    violationCount: z.number().int().openapi({
      description:
        'One per entry of the violation history: Admin decision on reports, dispute ruled against the user, late return.',
    }),
    pendingReportCount: z.number().int(),
    trustBlockStatus: z.enum(['review', 'lifted']).nullable().openapi({
      description:
        'review = refused for a low Trust Score and waiting for an Admin; lifted = an Admin lifted ' +
        'the Trust Score block and it still holds; null otherwise.',
    }),
    createdAt: isoDateTimeSchema,
  })
  .openapi('AdminAccountListItem');
export type AccountListItem = z.infer<typeof accountListItemSchema>;

export const accountCountsSchema = z
  .record(z.enum(accountListTabs), z.number().int())
  .openapi('AdminAccountCounts');
export type AccountCounts = z.infer<typeof accountCountsSchema>;

/**
 * One recorded breach of the violation history (R03 III.7.2.1 (7)), with its date and source:
 * an Admin decision on a violation report, a dispute ruled against the user (UC19) or a late
 * return. `id` is the report, the dispute or the rental order.
 */
const violationEntryBase = { id: z.string(), date: isoDateTimeSchema.nullable() };

export const accountViolationSchema = z
  .discriminatedUnion('source', [
    z.object({
      source: z.literal('report'),
      ...violationEntryBase,
      reason: z.string(),
      targetKind: z.string(),
      action: z.enum(reportActions).nullable(),
      note: z.string().nullable(),
      reportCount: z.number().int().openapi({
        description: 'Reports on the same target that this one decision closed (one violation).',
      }),
    }),
    z.object({
      source: z.literal('dispute'),
      ...violationEntryBase,
      orderCode: z.string(),
      ruling: z.enum(disputeRulings),
      note: z.string().nullable(),
    }),
    z.object({
      source: z.literal('late_return'),
      ...violationEntryBase,
      orderCode: z.string(),
      lateDays: z.number().int(),
      lateFee: z.number(),
    }),
  ])
  .openapi('AdminAccountViolation');
export type AccountViolation = z.infer<typeof accountViolationSchema>;

const adminRefSchema = z.object({ id: z.string(), fullName: z.string().nullable() });

/**
 * GB-29 block of the account and its Admin review (UC29, FE-09; R03 screen 47: "lift a Trust
 * Score block"). One open review per user; history of decisions is in the audit log.
 */
export const accountTrustBlockSchema = z
  .object({
    threshold: z.number().openapi({ description: 'Current Trust Score threshold (system setting).' }),
    depositLimit: z.number().openapi({
      description: 'Current deposit (VND) above which the threshold applies (system setting).',
    }),
    blocked: z.boolean().openapi({
      description:
        'True when a booking of a toy with a deposit above depositLimit is refused now: the score ' +
        'is below the threshold and no lift holds.',
    }),
    review: z
      .object({
        requestedAt: isoDateTimeSchema.openapi({ description: 'First refused attempt.' }),
        lastBlockedAt: isoDateTimeSchema,
        attemptCount: z.number().int().openapi({
          description: 'Refused attempts; repeats on the same toy within 30 minutes count once.',
        }),
        toy: z.object({ id: z.string(), title: z.string().nullable() }).nullable().openapi({
          description: 'The latest toy the Renter tried to book.',
        }),
        depositPrice: z.number(),
        score: z.number().openapi({ description: 'Score at the latest refused attempt.' }),
        threshold: z.number(),
        depositLimit: z.number(),
      })
      .nullable()
      .openapi({ description: 'The open review; null when none waits for an Admin.' }),
    lift: z
      .object({
        liftedAt: isoDateTimeSchema,
        liftedBy: adminRefSchema.nullable(),
        reason: z.string(),
        score: z.number().openapi({
          description: 'The lift holds while the Trust Score stays at or above this score.',
        }),
      })
      .nullable()
      .openapi({ description: 'A lift that still holds.' }),
    lastDecision: z
      .object({
        action: z.enum(trustDecisionActions),
        reason: z.string(),
        decidedAt: isoDateTimeSchema,
        decidedBy: adminRefSchema.nullable(),
        score: z.number(),
      })
      .nullable(),
  })
  .openapi('AdminAccountTrustBlock');
export type AccountTrustBlock = z.infer<typeof accountTrustBlockSchema>;

export const accountDetailSchema = accountListItemSchema
  .extend({
    phone: z.string(),
    email: z.string(),
    lastLoginAt: isoDateTimeSchema.nullable().openapi({
      description: 'Last successful sign-in; null when not recorded yet.',
    }),
    averageRating: z.number().nullable().openapi({
      description: 'Average star rating received; null while ratings (UC24) are not built.',
    }),
    completedBookingCount: z.number().int().openapi({
      description: 'Completed rentals, as Renter or Owner.',
    }),
    lock: z
      .object({
        reason: z.string().nullable(),
        lockedAt: isoDateTimeSchema.nullable(),
        lockedBy: z.object({ id: z.string(), fullName: z.string().nullable() }).nullable(),
        until: isoDateTimeSchema.nullable(),
        hiddenListingCount: z.number().int(),
      })
      .nullable(),
    activeListingCount: z.number().int(),
    violations: z.array(accountViolationSchema).openapi({
      description:
        'Resolved reports against the user, disputes ruled against them and late returns, newest first (max 50).',
    }),
    trustBlock: accountTrustBlockSchema,
  })
  .openapi('AdminAccountDetail');
export type AccountDetail = z.infer<typeof accountDetailSchema>;

export const accountActionResultSchema = z
  .object({
    id: z.string(),
    accountStatus: accountStatusSchema,
    lockedUntil: isoDateTimeSchema.nullable(),
    listingsChanged: z.number().int().openapi({
      description: 'Listings hidden by the lock, or shown again by the unlock.',
    }),
  })
  .openapi('AdminAccountActionResult');
export type AccountActionResult = z.infer<typeof accountActionResultSchema>;

/** Lift or keep a Trust Score block: a reason sent to the Renter, 20 to 300 characters. */
export const trustDecisionBodySchema = z
  .object({ reason: accountReasonSchema })
  .strict()
  .openapi('TrustDecisionRequest');
export type TrustDecisionBody = z.infer<typeof trustDecisionBodySchema>;

/** Lock from a Trust Score review: the same choices and reason as any lock (R03 III.7.2.1 (8)-(9)). */
export const trustLockBodySchema = lockAccountBodySchema;
export type TrustLockBody = LockAccountBody;

export const trustDecisionResultSchema = z
  .object({
    id: z.string(),
    decision: z.enum(trustDecisionActions),
    accountStatus: accountStatusSchema,
    lockedUntil: isoDateTimeSchema.nullable(),
  })
  .openapi('TrustDecisionResult');
export type TrustDecisionResult = z.infer<typeof trustDecisionResultSchema>;

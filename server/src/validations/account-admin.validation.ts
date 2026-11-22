import { lockDurations, reportActions } from '../constants/violation-report.js';
import {
  isoDateTimeSchema,
  paginationQueryWithSort,
  searchQuerySchema,
} from './common.validation.js';
import { z } from './zod.js';

// Admin account management (UC29, R03 III.7.2.1): list, detail, lock and unlock with a reason.

export const accountListTabs = ['all', 'active', 'locked', 'reported'] as const;
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
      description: 'all, active, locked, or reported = users with pending reports ("New reports").',
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
    violationCount: z.number().int(),
    pendingReportCount: z.number().int(),
    createdAt: isoDateTimeSchema,
  })
  .openapi('AdminAccountListItem');
export type AccountListItem = z.infer<typeof accountListItemSchema>;

export const accountCountsSchema = z
  .record(z.enum(accountListTabs), z.number().int())
  .openapi('AdminAccountCounts');
export type AccountCounts = z.infer<typeof accountCountsSchema>;

export const accountDetailSchema = accountListItemSchema
  .extend({
    phone: z.string(),
    email: z.string(),
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
    violations: z
      .array(
        z.object({
          reportId: z.string(),
          reason: z.string(),
          targetKind: z.string(),
          action: z.enum(reportActions).nullable(),
          note: z.string().nullable(),
          resolvedAt: isoDateTimeSchema.nullable(),
        }),
      )
      .openapi({ description: 'Resolved reports against the user, newest first (max 50).' }),
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

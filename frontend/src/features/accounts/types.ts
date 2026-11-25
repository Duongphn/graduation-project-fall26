import type {
  IdentityStatus,
  LockDuration,
  ReportAction,
  UserRole,
  UserStatus,
} from '../../constants/domain'
import type { PaginationParams } from '../../types/api'
import type { DisputeRuling } from '../disputes/types'

// Responses of /admin/users (server/src/validations/account-admin.validation.ts).

// trust_review: Renters refused for a low Trust Score who wait for an Admin (UC29, FE-09).
export const accountTabs = ['all', 'active', 'locked', 'reported', 'trust_review'] as const
export type AccountTab = (typeof accountTabs)[number]

// Trust Score bands (R03 III.7.2.1 (2), GB-29): below 50, 50 to 99, and 100 (also not scored yet).
export const accountTrustBands = ['low', 'medium', 'full'] as const
export type AccountTrustBand = (typeof accountTrustBands)[number]

export interface AccountListItem {
  id: string
  fullName: string
  avatar: string | null
  maskedPhone: string
  maskedEmail: string
  role: UserRole
  // LOCKED while an Admin lock runs.
  accountStatus: UserStatus
  lockedUntil: string | null
  verificationStatus: IdentityStatus
  trustScore: number | null
  violationCount: number
  pendingReportCount: number
  // review: refused for a low Trust Score and waiting for an Admin; lifted: an Admin lift holds.
  trustBlockStatus: TrustBlockStatus | null
  createdAt: string
}

export type TrustBlockStatus = 'review' | 'lifted'

export const trustDecisionActions = ['lift', 'keep', 'lock'] as const
export type TrustDecisionAction = (typeof trustDecisionActions)[number]

interface AdminRef {
  id: string
  fullName: string | null
}

// GB-29 block and its Admin review (UC29, FE-09; R03 screen 47 "lift a Trust Score block").
export interface AccountTrustBlock {
  // Current system settings (UC30).
  threshold: number
  depositLimit: number
  // A booking of a toy with a deposit above depositLimit is refused now.
  blocked: boolean
  review: {
    requestedAt: string
    lastBlockedAt: string
    // Repeats on the same toy within 30 minutes count once.
    attemptCount: number
    toy: { id: string; title: string | null } | null
    depositPrice: number
    // Values when the Renter was refused last.
    score: number
    threshold: number
    depositLimit: number
  } | null
  // A lift that still holds: while the score stays at or above `score`.
  lift: { liftedAt: string; liftedBy: AdminRef | null; reason: string; score: number } | null
  lastDecision: {
    action: TrustDecisionAction
    reason: string
    decidedAt: string
    decidedBy: AdminRef | null
    score: number
  } | null
}

export type AccountCounts = Record<AccountTab, number>

// One recorded breach with its date and source (R03 III.7.2.1 (7)); `id` is the report, the
// dispute or the rental order.
interface AccountViolationBase {
  id: string
  date: string | null
}

export type AccountViolation =
  | (AccountViolationBase & {
      source: 'report'
      reason: string
      targetKind: string
      action: ReportAction | null
      note: string | null
      // Reports on the same target closed by this one Admin decision (one violation).
      reportCount: number
    })
  | (AccountViolationBase & {
      source: 'dispute'
      orderCode: string
      ruling: DisputeRuling
      note: string | null
    })
  | (AccountViolationBase & {
      source: 'late_return'
      orderCode: string
      lateDays: number
      lateFee: number
    })

export interface AccountDetail extends AccountListItem {
  phone: string
  email: string
  // Null until the user signs in again after sign-ins started to be recorded.
  lastLoginAt: string | null
  // Null while ratings (UC24) are not built.
  averageRating: number | null
  completedBookingCount: number
  lock: {
    reason: string | null
    lockedAt: string | null
    lockedBy: { id: string; fullName: string | null } | null
    // Null for a permanent lock.
    until: string | null
    hiddenListingCount: number
  } | null
  activeListingCount: number
  violations: AccountViolation[]
  trustBlock: AccountTrustBlock
}

export interface AccountActionResult {
  id: string
  accountStatus: UserStatus
  lockedUntil: string | null
  listingsChanged: number
}

export interface AccountFilters {
  role?: UserRole
  trustBand?: AccountTrustBand
  q?: string
}

export interface AccountListParams extends PaginationParams, AccountFilters {
  tab?: AccountTab
}

export type AccountAction = LockDuration | 'unlock'

export interface TrustDecisionResult {
  id: string
  decision: TrustDecisionAction
  accountStatus: UserStatus
  lockedUntil: string | null
}

export type TrustDecisionInput =
  | { id: string; action: 'lift' | 'keep'; reason: string }
  | { id: string; action: 'lock'; duration: LockDuration; reason: string }

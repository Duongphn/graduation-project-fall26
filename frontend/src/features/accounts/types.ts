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

export const accountTabs = ['all', 'active', 'locked', 'reported'] as const
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
  createdAt: string
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

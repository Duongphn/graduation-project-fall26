import { useAccountCounts } from '../../features/accounts/hooks'
import { useIdentityCounts } from '../../features/identity-verifications/hooks'
import { useToyStatusCounts } from '../../features/toy-moderation/hooks'
import { useReportCounts } from '../../features/violation-reports/hooks'
import type { AdminPendingCounter } from '../../routes/admin-menu'

const ALL_TOYS = {}
const ALL_REPORTS = {}
const ALL_ACCOUNTS = {}

// Pending counters of the admin menu (R03 III.7.1.1 (4), L7): listings and identity requests that
// wait for an Admin, and Renters blocked by a low Trust Score (UC29, FE-09). They share the query
// keys of the feature pages, so a decision refreshes them.
export function useAdminPendingCounts(): Partial<Record<AdminPendingCounter, number>> {
  const toys = useToyStatusCounts(ALL_TOYS)
  const identity = useIdentityCounts()
  const reports = useReportCounts(ALL_REPORTS)
  const accounts = useAccountCounts(ALL_ACCOUNTS)
  return {
    toys: toys.data?.pending,
    identityVerifications: identity.data?.pending,
    violationReports: reports.data?.pending,
    users: accounts.data?.trust_review,
  }
}

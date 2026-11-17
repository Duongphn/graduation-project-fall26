import { useIdentityCounts } from '../../features/identity-verifications/hooks'
import { useToyStatusCounts } from '../../features/toy-moderation/hooks'
import type { AdminPendingCounter } from '../../routes/admin-menu'

const ALL_TOYS = {}

// Pending counters of the admin menu (R03 III.7.1.1 (4), L7): listings and identity requests that
// wait for an Admin. They share the query keys of the feature pages, so a decision refreshes them.
export function useAdminPendingCounts(): Partial<Record<AdminPendingCounter, number>> {
  const toys = useToyStatusCounts(ALL_TOYS)
  const identity = useIdentityCounts()
  return {
    toys: toys.data?.pending,
    identityVerifications: identity.data?.pending,
  }
}

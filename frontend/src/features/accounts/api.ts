import type { LockDuration } from '../../constants/domain'
import { apiGet, apiGetPage, apiPost } from '../../services/http'
import type {
  AccountActionResult,
  AccountCounts,
  AccountDetail,
  AccountFilters,
  AccountListItem,
  AccountListParams,
} from './types'

const BASE = '/admin/users'

// Admin account management (UC29): list, detail, lock and unlock with a reason.
export const accountsApi = {
  list: (params: AccountListParams) => apiGetPage<AccountListItem>(BASE, params),

  counts: (filters: AccountFilters) => apiGet<AccountCounts>(`${BASE}/counts`, filters),

  detail: (id: string) => apiGet<AccountDetail>(`${BASE}/${id}`),

  // Hides the user's listings, ends their sessions and freezes withdrawals (GB-05).
  lock: (id: string, duration: LockDuration, reason: string) =>
    apiPost<AccountActionResult>(`${BASE}/${id}/lock`, { duration, reason }),

  unlock: (id: string, reason: string) =>
    apiPost<AccountActionResult>(`${BASE}/${id}/unlock`, { reason }),
}

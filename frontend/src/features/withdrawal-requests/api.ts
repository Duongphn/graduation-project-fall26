import { apiGet, apiPatch } from '../../services/http'
import { toPaginated, type ListPage } from '../wallet/wallet-api'
import type { AdminWithdrawal, AdminWithdrawalListParams, ProcessWithdrawalInput, WithdrawalCounts } from './types'

// Same paths as the lead's API (server/docs/api/wallets.md 4b–4d).
const BASE = '/wallets/admin/withdrawals'

export const withdrawalRequestsApi = {
  // Pending requests come oldest first (first come, first paid).
  list: async (params: AdminWithdrawalListParams) =>
    toPaginated(await apiGet<ListPage<AdminWithdrawal>>(BASE, params)),

  counts: () => apiGet<WithdrawalCounts>(`${BASE}/counts`),

  // 409 WITHDRAWAL_ALREADY_PROCESSED: another Admin got there first. 403 WALLET_FROZEN: the owner's
  // account is locked, so the money cannot be paid out (refusing it is still allowed).
  process: (id: string, input: ProcessWithdrawalInput) => apiPatch<AdminWithdrawal>(`${BASE}/${id}/process`, input),
}

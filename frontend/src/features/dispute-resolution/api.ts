import { apiGet, apiPost } from '../../services/http'
import type { PaginationMeta } from '../../types/api'
import type { AdminDispute, AdminDisputeCase, AdminDisputeListParams, ResolveDisputeInput } from './types'

const BASE = '/admin/disputes'

interface DisputePage {
  items: AdminDispute[]
  total: number
  page: number
  limit: number
}

// The dispute list answers { items, total, page, limit } in `data`; DataTable reads PaginationMeta.
const toPagination = ({ total, page, limit }: DisputePage): PaginationMeta => {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return { page, limit, totalItems: total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
}

// Admin review of disputes (UC19). A verdict is final: a second one gets 409 DISPUTE_NOT_UNDER_REVIEW.
export const disputeResolutionApi = {
  list: async (params: AdminDisputeListParams) => {
    const data = await apiGet<DisputePage>(BASE, params)
    return { items: data.items, pagination: toPagination(data) }
  },

  caseFile: (id: string) => apiGet<AdminDisputeCase>(`${BASE}/${id}`),

  resolve: (id: string, input: ResolveDisputeInput) => apiPost<AdminDispute>(`${BASE}/${id}/resolve`, input),
}

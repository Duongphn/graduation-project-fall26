import { apiGet, apiPost } from '../../services/http'
import type { PaginationMeta } from '../../types/api'
import type { TrustDecisionInput, TrustQueueItem, TrustQueueParams, TrustReviewDetail } from './types'

const BASE = '/admin/trust-reviews'

interface TrustQueuePage {
  items: TrustQueueItem[]
  total: number
  page: number
  limit: number
}

// The queue answers { items, total, page, limit } in `data`; DataTable reads PaginationMeta.
const toPagination = ({ total, page, limit }: TrustQueuePage): PaginationMeta => {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  return { page, limit, totalItems: total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
}

// Renters blocked by the Trust Score, oldest request first. Opening the detail recomputes the score.
export const trustReviewApi = {
  list: async (params: TrustQueueParams) => {
    const data = await apiGet<TrustQueuePage>(BASE, params)
    return { items: data.items, pagination: toPagination(data) }
  },

  detail: (userId: string) => apiGet<TrustReviewDetail>(`${BASE}/${userId}`),

  decide: (userId: string, input: TrustDecisionInput) => apiPost<TrustReviewDetail>(`${BASE}/${userId}/decision`, input),
}

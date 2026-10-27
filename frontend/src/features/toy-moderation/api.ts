import { apiGet, apiGetPage, apiPost } from '../../services/http'
import type {
  ToyModerationDecision,
  ToyModerationDetail,
  ToyModerationFilters,
  ToyModerationListItem,
  ToyModerationQueueParams,
  ToyStatusCounts,
} from './types'

const BASE = '/admin/toys'

// Admin moderation of toy posts (UC27). `expectedUpdatedAt` is the post's updatedAt as the Admin
// saw it: the backend refuses the decision (409 TOY_CHANGED) if the Owner edited it meanwhile.
export const toyModerationApi = {
  queue: (params: ToyModerationQueueParams) => apiGetPage<ToyModerationListItem>(BASE, params),

  counts: (filters: ToyModerationFilters) => apiGet<ToyStatusCounts>(`${BASE}/counts`, filters),

  detail: (id: string) => apiGet<ToyModerationDetail>(`${BASE}/${id}`),

  approve: (id: string, expectedUpdatedAt: string) =>
    apiPost<ToyModerationDecision>(`${BASE}/${id}/approve`, { expectedUpdatedAt }),

  reject: (id: string, expectedUpdatedAt: string, reason: string) =>
    apiPost<ToyModerationDecision>(`${BASE}/${id}/reject`, { expectedUpdatedAt, reason }),
}

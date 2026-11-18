import { apiGet, apiGetPage, apiPost } from '../../services/http'
import type {
  SafetyChecklist,
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

  // Every item of the safety checklist must be true, or the server answers 400 (GB-48).
  approve: (id: string, expectedUpdatedAt: string, safetyChecklist: SafetyChecklist) =>
    apiPost<ToyModerationDecision>(`${BASE}/${id}/approve`, { expectedUpdatedAt, safetyChecklist }),

  reject: (id: string, expectedUpdatedAt: string, reason: string) =>
    apiPost<ToyModerationDecision>(`${BASE}/${id}/reject`, { expectedUpdatedAt, reason }),
}

import { apiGet, apiGetPage, apiPost } from '../../services/http'
import type {
  IdentityCounts,
  IdentityQueueItem,
  IdentityQueueParams,
  IdentityReviewResult,
  IdentityVerificationDetail,
} from './types'

const BASE = '/admin/identity-verifications'

export const identityVerificationsApi = {
  list: (params: IdentityQueueParams) => apiGetPage<IdentityQueueItem>(BASE, params),
  counts: () => apiGet<IdentityCounts>(`${BASE}/counts`),
  detail: (id: string) => apiGet<IdentityVerificationDetail>(`${BASE}/${id}`),
  approve: (id: string) => apiPost<IdentityReviewResult>(`${BASE}/${id}/approve`, {}),
  reject: (id: string, reason: string) =>
    apiPost<IdentityReviewResult>(`${BASE}/${id}/reject`, { reason }),
}

import { apiGet, apiGetPage, apiPost } from '../../services/http'
import type { DisputeDetail, DisputeListItem, DisputeListParams, ResolveDisputeInput } from './types'

const BASE = '/admin/disputes'

export const disputesApi = {
  list: (params: DisputeListParams) => apiGetPage<DisputeListItem>(BASE, params),
  detail: (id: string) => apiGet<DisputeDetail>(`${BASE}/${id}`),
  resolve: (id: string, input: ResolveDisputeInput) => apiPost<DisputeDetail>(`${BASE}/${id}/resolve`, input),
}

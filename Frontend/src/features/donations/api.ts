import { apiGet, apiGetPage, apiPost } from '../../services/http'
import type {
  ConfirmReceivedInput,
  DonationCountParams,
  DonationCounts,
  DonationListParams,
  DonationRequest,
  DonationRequestDetail,
} from './types'

const BASE = '/admin/donation-requests'

export const donationRequestsApi = {
  list: (params: DonationListParams) => apiGetPage<DonationRequest>(BASE, params),

  counts: (params: DonationCountParams) => apiGet<DonationCounts>(`${BASE}/counts`, params),

  detail: (id: string) => apiGet<DonationRequestDetail>(`${BASE}/${id}`),

  accept: (id: string) => apiPost<DonationRequestDetail>(`${BASE}/${id}/accept`),

  reject: (id: string, reason: string) =>
    apiPost<DonationRequestDetail>(`${BASE}/${id}/reject`, { reason }),

  // PENDING, ACCEPTED or SHIPPING; the reason is required for an Admin.
  cancel: (id: string, reason: string) =>
    apiPost<DonationRequestDetail>(`${BASE}/${id}/cancel`, { reason }),

  // SHIPPING only: the Admin confirms the receiver got the toy, with a required reason.
  confirmReceived: (id: string, input: ConfirmReceivedInput) =>
    apiPost<DonationRequestDetail>(`${BASE}/${id}/confirm-received`, input),
}

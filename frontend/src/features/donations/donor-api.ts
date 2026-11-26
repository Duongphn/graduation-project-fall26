import { apiGet, apiGetPage, apiPost } from '../../services/http'
import type {
  DonationRequest,
  DonationRequestDetail,
  DonorDonationSummary,
  DonorOrganizationRequestInput,
  HandoverInput,
  IncomingDonationParams,
} from './types'

const BASE = '/donation-requests'

// The Donor's side of /donation-requests (user routes; the Admin side is in api.ts).
export const donorDonationsApi = {
  // Requests on the caller's own donation toys.
  incoming: (params: IncomingDonationParams) => apiGetPage<DonationRequest>(`${BASE}/incoming`, params),

  // Public figure shown on the Donor profile.
  summary: (userId: string) => apiGet<DonorDonationSummary>(`/donors/${userId}/donation-summary`),

  detail: (id: string) => apiGet<DonationRequestDetail>(`${BASE}/${id}`),

  // UC33 (GB-56): the Donor sends their own Active donation post to an organization (Pending, the
  // Admin decides for the organization).
  sendToOrganization: (input: DonorOrganizationRequestInput) =>
    apiPost<DonationRequestDetail>(`${BASE}/to-organization`, input),

  // D-04: only the Donor accepts or rejects a PENDING request.
  accept: (id: string) => apiPost<DonationRequestDetail>(`${BASE}/${id}/accept`),

  reject: (id: string, reason: string) =>
    apiPost<DonationRequestDetail>(`${BASE}/${id}/reject`, { reason }),

  // ACCEPTED → SHIPPING: the Donor sends the toy with photos of the parcel or the handover.
  handOver: (id: string, input: HandoverInput) =>
    apiPost<DonationRequestDetail>(`${BASE}/${id}/handover`, input),

  // PENDING or ACCEPTED only: a user cannot cancel once the toy is shipping.
  cancel: (id: string, note?: string) =>
    apiPost<DonationRequestDetail>(`${BASE}/${id}/cancel`, note ? { note } : {}),
}

import { apiGetPage, apiPost } from '../../services/http'
import type {
  DonationRequest,
  DonationRequestDetail,
  HandoverInput,
  IncomingDonationParams,
} from './types'

const BASE = '/donation-requests'

export interface CreateDonationRequestInput {
  toyId: string
  message?: string
}

// The receiver's side of /donation-requests (detail and cancel are shared with donor-api.ts).
export const receiverDonationsApi = {
  // A USER asks for an active donation toy (listingType donate) that is not their own.
  create: (input: CreateDonationRequestInput) => apiPost<DonationRequestDetail>(BASE, input),

  // Requests the caller made.
  mine: (params: IncomingDonationParams) => apiGetPage<DonationRequest>(`${BASE}/mine`, params),

  // SHIPPING → COMPLETED: the receiver confirms with 1–10 own HANDOVER_PHOTO uploads.
  confirmReceived: (id: string, input: HandoverInput) =>
    apiPost<DonationRequestDetail>(`${BASE}/${id}/confirm-received`, input),
}

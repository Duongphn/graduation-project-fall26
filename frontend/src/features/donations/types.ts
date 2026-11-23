import type {
  ActorType,
  DonationReceiverType,
  DonationStatus,
  HandoverStep,
  ToyStatus,
} from '../../constants/domain'
import type { PaginationParams } from '../../types/api'
import type { DonationSortField } from './constants'

// DTOs of /admin/donation-requests (server donation_requests.schemas.ts).

export interface DonationPerson {
  id: string
  fullName: string
  avatarUrl: string | null
  // Admin detail only, masked by the server (GB-35).
  phone?: string
  email?: string
}

export interface DonationToy {
  id: string
  title: string
  imageUrl: string | null
  // Free text in develop's toys model.
  condition: string
  ageRange: { minAge: number; maxAge: number } | null
  // 'donated' once a request for it is confirmed (GB-60, derived by the server).
  status: ToyStatus | 'donated'
}

// GB-51: the public part of the receiving point; the Admin view adds its contact.
export interface DonationReceivingPoint {
  province: string
  ward: string
  street: string
  openingHours: string
  acceptsDropOff: boolean
  acceptsParcel: boolean
  // Admin detail only.
  contactName?: string
  contactPhone?: string
}

export interface DonationOrganization {
  id: string
  name: string
  status: string
  // GB-55: false = takes no new requests (pending ones are still decided).
  isAccepting: boolean
  // null for an organization saved before receiving points existed.
  receivingPoint: DonationReceivingPoint | null
  // Admin detail only.
  address?: string
  contactInfo?: string
  supportCriteria?: string | null
}

// GB-58 and GB-59 (server constants/donation-request-transitions.ts).
export type DonationHandoverMethod = 'drop_off' | 'carrier'
export type ReceiptChannel = 'phone' | 'email' | 'in_person'

// GB-59: the organization's confirmation recorded by the Admin.
export interface DonationReceipt {
  confirmedBy: string | null
  channel: ReceiptChannel | null
  receivedAt: string | null
}

// D-03: the other party's full name and phone, only while ACCEPTED or SHIPPING (user routes);
// always null on admin routes.
export interface DonationCounterpartContact {
  name: string
  phone: string | null
}

export interface DonationRequest {
  id: string
  code: string
  status: DonationStatus
  receiverType: DonationReceiverType
  // The requester's message (develop's itemDetails; the toy title when none was given).
  message: string | null
  deliveryMethod: string
  // GB-56: who accepts or rejects while pending. ADMIN: a request the Donor sent to an
  // organization; DONOR: a Receiver's request or the Admin's request for an organization.
  decider: 'ADMIN' | 'DONOR'
  handoverMethod: DonationHandoverMethod | null
  carrierName: string | null
  trackingCode: string | null
  receipt: DonationReceipt | null
  // Expiry deadline of the current step (develop's timer.dueAt).
  dueAt: string | null
  toy: DonationToy | null
  donor: DonationPerson | null
  requester: DonationPerson | null
  organization: DonationOrganization | null
  counterpartContact: DonationCounterpartContact | null
  decidedAt: string | null
  rejectReason: string | null
  completedAt: string | null
  // GB-57: when the expiry job set the request to expired, and why (no decision / no handover in time)
  expiredAt: string | null
  expiryReason: string | null
  createdAt: string
  updatedAt: string
}

export interface DonationHandover {
  step: HandoverStep
  by: string
  // 5-minute signed links; null when storage is not configured.
  photos: Array<string | null>
  note: string | null
  at: string
}

export interface DonationHistoryEntry {
  fromStatus: DonationStatus | null
  toStatus: DonationStatus
  actorType: ActorType
  actorId: string | null
  reason: string | null
  at: string
}

export interface DonationRequestDetail extends DonationRequest {
  decidedBy: string | null
  handovers: DonationHandover[]
  cancellation: {
    reason: string
    actorType: ActorType
    by: string | null
    note: string | null
    at: string
  } | null
  history: DonationHistoryEntry[]
}

export type DonationCounts = Record<DonationStatus, number>

export interface PrivatePhoto {
  publicId: string
  format: string
}

// USER receiver: `reason` is required. Organization (GB-59): confirmedBy, channel, receivedAt
// (YYYY-MM-DD) and at least one photo are required.
export interface ConfirmReceivedInput {
  reason?: string
  photos?: PrivatePhoto[]
  note?: string
  confirmedBy?: string
  channel?: ReceiptChannel
  receivedAt?: string
}

// The Donor hands the toy over: 1–10 own HANDOVER_PHOTO uploads and an optional note.
export interface HandoverInput {
  // GB-58: drop-off at the receiving point or a carrier chosen by the Donor.
  handoverMethod?: 'drop_off' | 'carrier'
  // Optional free text, only for a carrier.
  carrierName?: string
  trackingCode?: string
  photos: PrivatePhoto[]
  note?: string
}

// GET /donors/:userId/donation-summary: donations the receiver confirmed (COMPLETED).
export interface DonorDonationSummary {
  userId: string
  completedDonations: number
}

// GET /donation-requests/incoming: requests on the caller's own donation toys.
export interface IncomingDonationParams extends Omit<PaginationParams, 'sortBy'> {
  sortBy?: DonationSortField
  status?: DonationStatus
}

export interface DonationListParams extends Omit<PaginationParams, 'sortBy'> {
  sortBy?: DonationSortField
  status?: DonationStatus
  receiverType?: DonationReceiverType
  // Request code or toy title (accents ignored).
  q?: string
}

// The counts follow every filter except the status tab.
export type DonationCountParams = Omit<DonationListParams, 'status' | keyof PaginationParams>

import type {
  ActorType,
  AgeGroup,
  DonationReceiverType,
  DonationStatus,
  HandoverStep,
  ToyCondition,
  ToyStatus,
  VisibilityStatus,
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
  condition: ToyCondition
  ageGroup: AgeGroup
  status: ToyStatus
}

export interface DonationOrganization {
  id: string
  name: string
  status: VisibilityStatus
  address?: string
  contactInfo?: string
  phone?: string | null
  logoUrl?: string | null
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
  message: string | null
  toy: DonationToy | null
  donor: DonationPerson | null
  requester: DonationPerson | null
  organization: DonationOrganization | null
  counterpartContact: DonationCounterpartContact | null
  decidedAt: string | null
  rejectReason: string | null
  completedAt: string | null
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

export interface ConfirmReceivedInput {
  reason: string
  photos?: PrivatePhoto[]
  note?: string
}

// The Donor hands the toy over: 1–10 own HANDOVER_PHOTO uploads and an optional note.
export interface HandoverInput {
  photos: PrivatePhoto[]
  note?: string
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

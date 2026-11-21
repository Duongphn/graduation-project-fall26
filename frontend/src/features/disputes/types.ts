import type { DisputeStatus } from '../../constants/domain'
import type { DisputeRuling, RentalHistoryEntry, RentalOrder } from '../rentals/rental-orders-api'
import type { ToyImage } from '../toy-listings/toy-listing-api'

// Shapes of the Admin dispute API (server routes/rental-dispute.routes.ts, UC19).

export type { DisputeRuling }

export type DisputeTab = 'open' | 'resolved'

export interface DisputeParty {
  id: string
  fullName: string
  avatar?: string
  trustScore?: number
}

export interface DisputeListItem {
  id: string
  code: string
  status: DisputeStatus
  reason: string
  openedAt: string
  // The other side may reply until then; the Admin decides after it (UC19).
  replyDueAt: string
  resolvedAt?: string
  claimant: 'owner' | 'renter'
  // R + D held in escrow.
  frozenAmount: number
  order: { id: string; code: string; status: string }
  toy: { id: string; title: string; image?: ToyImage } | null
  owner: DisputeParty | null
  renter: DisputeParty | null
}

export interface DisputeResolution {
  ruling: DisputeRuling
  compensationRate: number
  compensationAmount: number
  rentRefundAmount: number
  ownerAmount: number
  renterAmount: number
  platformFee: number
  adminDecision: string
  resolvedBy?: string
  resolvedAt?: string
}

export interface DisputeDetail extends DisputeListItem {
  description: string
  rentalOrder: RentalOrder
  history: RentalHistoryEntry[]
  resolution?: DisputeResolution
}

export interface DisputeListParams {
  status: DisputeTab
  page?: number
  limit?: number
}

export interface ResolveDisputeInput {
  ruling: DisputeRuling
  compensationRate: number
  adminDecision: string
}

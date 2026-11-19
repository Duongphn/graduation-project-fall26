import type { DisputeStatusValue } from '../../constants/domain'
import type { ComplaintRole, DisputeVerdict, RentalDispute, RentalOrder, RentalStatus } from '../rentals/rental-orders-api'

// Admin view of a dispute: same as a party sees it, plus the platform share of the payout.
export type AdminDispute = Omit<RentalDispute, 'resolution'> & {
  resolution?: Omit<NonNullable<RentalDispute['resolution']>, 'payout'> & {
    payout: { renter: number; owner: number; platform: number }
  }
}

export interface DisputeParty {
  id: string
  fullName: string
  avatar?: string
  trustScore?: number
  verified: boolean
}

// One status change of the order; `changedBy` is a user id (a party, an Admin or the system).
export interface CaseHistoryEntry {
  oldStatus?: RentalStatus
  newStatus: RentalStatus
  changedBy: string
  notes?: string
  occurredAt: string
}

// Money held in escrow for the order: rent R and deposit D, platform fee F, late fee L.
export interface DisputeAmounts {
  rentalFee: number
  depositAmount: number
  platformFee: number
  lateFee: number
}

// GET /admin/disputes/:id. Chat and AI assessment are not built yet: always null, never faked.
export interface AdminDisputeCase {
  dispute: AdminDispute
  claimant: DisputeParty
  respondent: DisputeParty
  caseFile: { order: RentalOrder; history: CaseHistoryEntry[]; amounts: DisputeAmounts }
  compensationCap: number
  conversation: null
  aiAssessment: null
}

export interface AdminDisputeListParams {
  status?: DisputeStatusValue
  page: number
  limit: number
}

export interface ResolveDisputeInput {
  verdict: DisputeVerdict
  compensation: number
  reason: string
}

export type { ComplaintRole, DisputeVerdict }

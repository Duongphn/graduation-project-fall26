import type { AdminDisputeCase, ComplaintRole, DisputeAmounts } from './types'

export interface PayoutPreview {
  renter: number
  owner: number
  platform: number
}

/**
 * Split of the escrow (rent R + deposit D) for compensation X, the same formula as the server
 * (disputePayout). Only a preview while the Admin types: the server computes the real split.
 * Owner complains: owner R − F + L + X, renter D − L − X. Renter complains: renter D + X, and the
 * platform fee shrinks with the rent kept by the owner.
 */
export const previewPayout = (amounts: DisputeAmounts, claimantRole: ComplaintRole, compensation: number): PayoutPreview => {
  const { rentalFee: R, depositAmount: D, platformFee: F, lateFee: L } = amounts
  if (claimantRole === 'owner') {
    return { owner: R - F + L + compensation, platform: F, renter: D - L - compensation }
  }
  const platform = R === 0 ? 0 : Math.round((F * (R - compensation)) / R)
  return { renter: D + compensation, owner: R - compensation - platform, platform }
}

export const ROLE_LABELS: Record<ComplaintRole, string> = { renter: 'Người thuê', owner: 'Chủ đồ' }

/** Who changed the order status in the timeline: one of the parties, or the system / an Admin */
export const actorName = (data: AdminDisputeCase, userId: string) => {
  const { dispute, claimant, respondent } = data
  if (userId === dispute.claimantId) return `${claimant.fullName} (${ROLE_LABELS[dispute.claimantRole].toLowerCase()})`
  if (userId === dispute.respondentId) {
    const role = dispute.claimantRole === 'renter' ? 'owner' : 'renter'
    return `${respondent.fullName} (${ROLE_LABELS[role].toLowerCase()})`
  }
  return 'Hệ thống / quản trị viên'
}

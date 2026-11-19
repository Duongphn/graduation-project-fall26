import type { RentalPricing } from '../toy-catalog/rental-request-api'
import type { DisputeRuling } from './types'

// Ruling options of the decision panel (R03 III.7.4.1 field 9) and the compensation steps (field 10).
export const RULING_OPTIONS: { value: DisputeRuling; label: string }[] = [
  { value: 'RENTER_AT_FAULT', label: 'Người thuê có lỗi' },
  { value: 'OWNER_AT_FAULT', label: 'Chủ đồ có lỗi' },
  { value: 'UNDETERMINED', label: 'Không xác định được lỗi' },
  { value: 'FAIR_WEAR_AND_TEAR', label: 'Hao mòn tự nhiên' },
]

export const rulingLabel = (ruling: DisputeRuling) =>
  RULING_OPTIONS.find((option) => option.value === ruling)?.label ?? ruling

export const COMPENSATION_RATES = [0, 25, 50, 75, 100] as const

export const DECISION_MIN = 30
export const DECISION_MAX = 500

export const DISPUTE_REASON_LABELS: Record<string, string> = {
  DAMAGED_ON_RETURN: 'Hư hỏng khi trả đồ',
}

/** A rate only applies when the ruling upholds the claim (the other side is at fault). */
export const rulingUpholdsClaim = (ruling: DisputeRuling, claimant: 'owner' | 'renter') =>
  claimant === 'owner' ? ruling === 'RENTER_AT_FAULT' : ruling === 'OWNER_AT_FAULT'

export interface RulingPreview {
  frozen: number
  /** K: compensation for the Owner, from the deposit */
  compensation: number
  /** G: rent refunded to the Renter */
  rentRefund: number
  owner: number
  platform: number
  renter: number
}

/**
 * Split preview of the frozen R + D, the same formula as the server (R03 I.2.6.6):
 * Owner R − G − F' + L + K, platform F' = p × (R − G), Renter D − L − K + G, with L + K ≤ D.
 */
export const previewRuling = (
  pricing: Pick<RentalPricing, 'rentalFee' | 'depositAmount' | 'platformFeeRate'>,
  lateFee: number,
  claimant: 'owner' | 'renter',
  ruling: DisputeRuling,
  rate: number,
): RulingPreview => {
  const { rentalFee: R, depositAmount: D, platformFeeRate: p } = pricing
  const share = rulingUpholdsClaim(ruling, claimant) ? rate / 100 : 0
  const compensation = claimant === 'owner' ? Math.min(Math.round(share * D), D - lateFee) : 0
  const rentRefund = claimant === 'renter' ? Math.round(share * R) : 0
  const platform = Math.round(p * (R - rentRefund))
  return {
    frozen: R + D,
    compensation,
    rentRefund,
    owner: R - rentRefund - platform + lateFee + compensation,
    platform,
    renter: D - lateFee - compensation + rentRefund,
  }
}

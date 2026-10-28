/**
 * Purchase order timing settings used by UC12/UC13.
 * Durations are in hours.
 */
export const PURCHASE_TIMING_PREFIX = 'purchase';

export interface PurchaseTimings {
  sellerResponseHours: number;
  buyerAutoCompleteHours: number;
}

export const DEFAULT_PURCHASE_TIMINGS: PurchaseTimings = {
  sellerResponseHours: 24,
  buyerAutoCompleteHours: 72,
};

import {
  TRUST_CANCEL_PENALTY,
  TRUST_DISPUTE_PENALTY,
  TRUST_RATING_MULTIPLIER,
} from '../constants/trust.js';
import { type IUser } from '../models/user.model.js';

export interface TrustScoreInput {
  reviewCount: number;
  ratingAverage: number | null;
  cancellations: number;
  disputesLost: number;
  minReviews: number;
}

// Returns null while the user has too few reviews to be scored.
export function computeTrustScore(input: TrustScoreInput): number | null {
  if (input.reviewCount < input.minReviews || input.ratingAverage === null) {
    return null;
  }
  const raw =
    input.ratingAverage * TRUST_RATING_MULTIPLIER -
    input.cancellations * TRUST_CANCEL_PENALTY -
    input.disputesLost * TRUST_DISPUTE_PENALTY;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Whether a blocked renter should (re-)enter the Admin review queue.
 * Callers only reach this while the user is restricted, so an ALLOW decision means its override has expired.
 */
export function shouldEnterQueue(trust: IUser['trust'], score: number | null): boolean {
  if (trust?.review?.requestedAt) {
    return false;
  }
  const last = trust?.lastDecision;
  if (!last) {
    return true;
  }
  if (last.decision === 'ALLOW') {
    return true;
  }
  return score !== last.scoreAtDecision;
}

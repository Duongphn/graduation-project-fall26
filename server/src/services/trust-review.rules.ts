import { STARTING_TRUST_SCORE } from '../constants/trust-review.js';
import type { IUser } from '../models/user.model.js';
import type { RentalSettings } from '../types/rental-order.types.js';

// GB-29 and the Admin's review of blocked Renters (UC29, FE-09). Pure rules, unit-tested
// without a database.

export type TrustFields = NonNullable<IUser['trust']>;
export type TrustSettings = Pick<RentalSettings, 'minTrustScore' | 'trustDepositLimit'>;

/** The stored score, or 100 for an account not scored yet (GB-29). */
export const trustScoreOf = (trust: TrustFields | null | undefined): number =>
  typeof trust?.score === 'number' ? trust.score : STARTING_TRUST_SCORE;

/** True when a stored score is below the threshold (an account not scored yet never is). */
export const isBelowThreshold = (
  trust: TrustFields | null | undefined,
  settings: TrustSettings,
): boolean => typeof trust?.score === 'number' && trust.score < settings.minTrustScore;

/**
 * An Admin lift holds while the score stays at or above the score it was given at: a better
 * score keeps it, a worse one (new bad ratings) ends it and the block applies again.
 */
export const isLiftActive = (trust: TrustFields | null | undefined): boolean => {
  const lift = trust?.lift;
  if (!lift?.liftedAt || typeof lift.score !== 'number') return false;
  return trustScoreOf(trust) >= lift.score;
};

/**
 * GB-29, UC06 step 4.1 (MSG28): a Renter whose score is below the threshold cannot book a toy
 * whose deposit is above the Admin's limit, unless an Admin lifted the block (UC29).
 */
export const isTrustBlocked = (
  trust: TrustFields | null | undefined,
  depositPrice: number,
  settings: TrustSettings,
): boolean =>
  isBelowThreshold(trust, settings) &&
  depositPrice > settings.trustDepositLimit &&
  !isLiftActive(trust);

/** True while a review waits for an Admin. */
export const hasOpenReview = (trust: TrustFields | null | undefined): boolean =>
  Boolean(trust?.review?.requestedAt);

/**
 * After the Admin kept the block, a refused attempt opens a new review only once the score has
 * changed: the same score brings nothing new to decide on. Lift and lock decisions do not hold
 * a new review back.
 */
export const isHeldBackByKeep = (trust: TrustFields | null | undefined, score: number): boolean =>
  !hasOpenReview(trust) && trust?.decision?.action === 'keep' && trust.decision.score === score;

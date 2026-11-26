import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  hasOpenReview,
  isBelowThreshold,
  isHeldBackByKeep,
  isLiftActive,
  isTrustBlocked,
  trustScoreOf,
  type TrustFields,
} from '../src/services/trust-review.rules.js';

// GB-29 and the Admin's review of blocked Renters (UC29, FE-09).
const settings = { minTrustScore: 50, trustDepositLimit: 500_000 };
const lift = (score: number) => ({ liftedAt: new Date(), liftedBy: new Types.ObjectId(), reason: 'x', score });

describe('trust block rules (GB-29)', () => {
  it('counts an account not scored yet as 100', () => {
    expect(trustScoreOf(undefined)).toBe(100);
    expect(trustScoreOf({})).toBe(100);
    expect(trustScoreOf({ score: 0 })).toBe(0);
    expect(trustScoreOf({ score: 49 })).toBe(49);
  });

  it('is below the threshold only for a stored score under it (49 yes, 50 no)', () => {
    expect(isBelowThreshold({ score: 49 }, settings)).toBe(true);
    expect(isBelowThreshold({ score: 0 }, settings)).toBe(true);
    expect(isBelowThreshold({ score: 50 }, settings)).toBe(false);
    expect(isBelowThreshold({ score: 51 }, settings)).toBe(false);
    expect(isBelowThreshold({}, settings)).toBe(false);
    expect(isBelowThreshold(null, settings)).toBe(false);
  });

  it('blocks only a deposit above the limit (500,001 yes, 500,000 no)', () => {
    expect(isTrustBlocked({ score: 49 }, 500_001, settings)).toBe(true);
    expect(isTrustBlocked({ score: 49 }, 500_000, settings)).toBe(false);
    expect(isTrustBlocked({ score: 49 }, 0, settings)).toBe(false);
    expect(isTrustBlocked({ score: 50 }, 5_000_000, settings)).toBe(false);
    expect(isTrustBlocked(undefined, 5_000_000, settings)).toBe(false);
  });

  it('follows the settings the Admin saved', () => {
    const strict = { minTrustScore: 70, trustDepositLimit: 100_000 };
    expect(isTrustBlocked({ score: 69 }, 100_001, strict)).toBe(true);
    expect(isTrustBlocked({ score: 70 }, 100_001, strict)).toBe(false);
    expect(isTrustBlocked({ score: 69 }, 100_000, strict)).toBe(false);
  });

  it('lets a lift hold while the score is not lower than at the lift', () => {
    expect(isLiftActive({ score: 40, lift: lift(40) })).toBe(true);
    expect(isLiftActive({ score: 45, lift: lift(40) })).toBe(true);
    expect(isLiftActive({ score: 39, lift: lift(40) })).toBe(false);
    expect(isLiftActive({ score: 40 })).toBe(false);
    // A lift without its score is not a valid lift.
    expect(isLiftActive({ score: 40, lift: { liftedAt: new Date() } })).toBe(false);
    expect(isTrustBlocked({ score: 40, lift: lift(40) }, 900_000, settings)).toBe(false);
    expect(isTrustBlocked({ score: 39, lift: lift(40) }, 900_000, settings)).toBe(true);
  });

  it('holds a new review back only after "keep" at the same score', () => {
    const kept = (score: number): TrustFields => ({
      score,
      decision: { action: 'keep', reason: 'x', decidedAt: new Date(), score: 40 },
    });
    expect(isHeldBackByKeep(kept(40), 40)).toBe(true);
    expect(isHeldBackByKeep(kept(38), 38)).toBe(false);
    expect(isHeldBackByKeep(kept(42), 42)).toBe(false);
    expect(
      isHeldBackByKeep({ score: 40, decision: { action: 'lock', score: 40 } }, 40),
    ).toBe(false);
    expect(
      isHeldBackByKeep({ score: 40, decision: { action: 'lift', score: 40 } }, 40),
    ).toBe(false);
    // An open review is always updated.
    expect(
      isHeldBackByKeep({ ...kept(40), review: { requestedAt: new Date() } }, 40),
    ).toBe(false);
    expect(hasOpenReview({ review: { requestedAt: new Date() } })).toBe(true);
    expect(hasOpenReview({ review: {} })).toBe(false);
  });
});

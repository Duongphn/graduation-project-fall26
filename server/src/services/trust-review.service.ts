import type { Types } from 'mongoose';

import { TRUST_ATTEMPT_MERGE_MINUTES } from '../constants/trust-review.js';
import * as repository from '../repositories/trust-review.repository.js';
import type { TrustSettings, TrustFields } from './trust-review.rules.js';
import { isHeldBackByKeep } from './trust-review.rules.js';

// Renters blocked by a low Trust Score go to the Admin (BF-02 2a, UC29, FE-09).

/**
 * Called by the booking check (UC06 step 4.1) when it refuses a Renter for a low score: records
 * the attempt on the Renter's review for the Admin. A failure here is logged and never changes
 * the refusal the Renter sees (MSG28).
 */
export const recordTrustBlock = async (input: {
  userId: string;
  trust: TrustFields | null | undefined;
  toy: { _id: Types.ObjectId; depositPrice?: number | null | undefined };
  settings: TrustSettings;
  now: Date;
}): Promise<boolean> => {
  const score = input.trust?.score;
  if (typeof score !== 'number' || isHeldBackByKeep(input.trust, score)) return false;
  try {
    return await repository.recordBlockedAttempt(
      input.userId,
      {
        toyId: input.toy._id,
        depositPrice: input.toy.depositPrice ?? 0,
        score,
        threshold: input.settings.minTrustScore,
        depositLimit: input.settings.trustDepositLimit,
        at: input.now,
      },
      new Date(input.now.getTime() - TRUST_ATTEMPT_MERGE_MINUTES * 60_000),
    );
  } catch (error) {
    console.error('[trust-review] Recording a blocked booking failed:', error);
    return false;
  }
};

import { Types, type ClientSession } from 'mongoose';

import type { TrustDecisionAction } from '../constants/trust-review.js';
import { Toy } from '../models/toy.model.js';
import { User, type IUser } from '../models/user.model.js';

// The Trust Score review of a Renter (UC29, FE-09), stored on the user: users.trust.review (the
// open review), users.trust.lift (an Admin lift) and users.trust.decision (the last decision).

export type TrustRecord = Pick<IUser, '_id' | 'role' | 'status' | 'trust' | 'lock'>;

export const findTrustOf = (id: string | Types.ObjectId, session?: ClientSession) =>
  User.findById(id)
    .select('role status trust lock')
    .session(session ?? null)
    .lean<TrustRecord>();

export interface BlockedAttempt {
  toyId: Types.ObjectId;
  depositPrice: number;
  score: number;
  threshold: number;
  depositLimit: number;
  at: Date;
}

/**
 * Records a refused booking on the user's open review, or opens one (one per user). A refusal of
 * the same toy since `mergeSince` is the same attempt: only its time and values are updated.
 * The values of the latest attempt are kept. A lift that no longer holds is removed.
 * `skipWhenKeptAt` holds back a new review after the Admin kept the block at that same score.
 * Returns false when nothing was written.
 */
export const recordBlockedAttempt = async (
  userId: string,
  attempt: BlockedAttempt,
  mergeSince: Date,
): Promise<boolean> => {
  const sameAttempt = {
    $and: [
      { $eq: ['$trust.review.toyId', attempt.toyId] },
      { $gte: ['$trust.review.lastBlockedAt', mergeSince] },
    ],
  };
  const result = await User.updateOne(
    {
      _id: new Types.ObjectId(userId),
      // isHeldBackByKeep, checked again in the update so that two attempts cannot both open one.
      $nor: [
        {
          'trust.review.requestedAt': { $exists: false },
          'trust.decision.action': 'keep',
          'trust.decision.score': attempt.score,
        },
      ],
    },
    [
      {
        $set: {
          'trust.review.requestedAt': { $ifNull: ['$trust.review.requestedAt', attempt.at] },
          'trust.review.attemptCount': {
            $cond: [
              sameAttempt,
              '$trust.review.attemptCount',
              { $add: [{ $ifNull: ['$trust.review.attemptCount', 0] }, 1] },
            ],
          },
          'trust.review.lastBlockedAt': attempt.at,
          'trust.review.toyId': attempt.toyId,
          'trust.review.depositPrice': attempt.depositPrice,
          'trust.review.score': attempt.score,
          'trust.review.threshold': attempt.threshold,
          'trust.review.depositLimit': attempt.depositLimit,
        },
      },
      { $unset: 'trust.lift' },
    ],
  );
  return result.modifiedCount > 0;
};

export interface TrustDecisionWrite {
  action: TrustDecisionAction;
  reason: string;
  decidedAt: Date;
  decidedBy: Types.ObjectId;
  score: number;
  /** Set for "lift": the block no longer applies at this score or above. */
  lift?: boolean;
}

/**
 * Writes the Admin's decision if the review (or its absence) is still the one the Admin saw:
 * `openSince` is the requestedAt of the open review, or null when there was none. Closes the open
 * review; "lift" stores the lift, "keep" and "lock" remove any lift. Null when it changed meanwhile.
 */
export const writeDecision = (
  userId: Types.ObjectId,
  openSince: Date | null,
  decision: TrustDecisionWrite,
  session: ClientSession,
) => {
  const record = {
    action: decision.action,
    reason: decision.reason,
    decidedAt: decision.decidedAt,
    decidedBy: decision.decidedBy,
    score: decision.score,
  };
  return User.findOneAndUpdate(
    {
      _id: userId,
      'trust.review.requestedAt': openSince ?? { $exists: false },
    },
    {
      $set: {
        'trust.decision': record,
        ...(decision.lift
          ? {
              'trust.lift': {
                liftedAt: decision.decidedAt,
                liftedBy: decision.decidedBy,
                reason: decision.reason,
                score: decision.score,
              },
            }
          : {}),
      },
      $unset: decision.lift ? { 'trust.review': 1 } : { 'trust.review': 1, 'trust.lift': 1 },
    },
    { new: true, session },
  ).lean<TrustRecord>();
};

export const findToyTitle = async (toyId: Types.ObjectId | undefined): Promise<string | null> => {
  if (!toyId) return null;
  const toy = await Toy.findById(toyId).select('title').lean<{ title: string }>();
  return toy?.title ?? null;
};

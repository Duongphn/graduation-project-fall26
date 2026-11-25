import { Types } from 'mongoose';

import { User } from '../models/user.model.js';

// The Trust Score review of a Renter (UC29, FE-09), stored on the user: users.trust.review (the
// open review), users.trust.lift (an Admin lift) and users.trust.decision (the last decision).

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

import { Types, type ClientSession } from 'mongoose';

import type { IdentityStatus, VerificationStatus } from '../../../shared/domain/statuses.js';
import { phoneSearchDigits } from '../../../shared/utils/phone.js';
import { accentInsensitivePattern, escapeRegex } from '../../../shared/utils/text.js';
import { UserModel } from '../../users/users.model.js';
import { IdentityVerificationModel } from '../identity_verifications.model.js';

// Database access of the Admin identity review. Only this file talks to Mongoose.

/** Upper bound of users a search may match, so the `$in` list stays small. */
export const MAX_SEARCH_USERS = 500;

const withoutImages = { frontImage: 0, backImage: 0, selfieImage: 0 } as const;

const userFields = {
  fullName: 1,
  phone: 1,
  email: 1,
  dateOfBirth: 1,
  status: 1,
  lock: 1,
  identityStatus: 1,
  createdAt: 1,
} as const;

/**
 * Ids of the users whose name (accent-insensitive), email (prefix) or phone (national digits,
 * anchored at the end of the E.164 number) matches. Capped at MAX_SEARCH_USERS.
 */
export const findUserIdsMatching = async (search: string): Promise<Types.ObjectId[]> => {
  const conditions: Record<string, unknown>[] = [
    { fullName: { $regex: accentInsensitivePattern(search), $options: 'i' } },
    { email: { $regex: `^${escapeRegex(search.toLowerCase())}` } },
  ];
  if (/^[\d\s+().-]+$/.test(search)) {
    const digits = phoneSearchDigits(search);
    if (digits.length >= 3) conditions.push({ phone: { $regex: `${escapeRegex(digits)}$` } });
  }
  const users = await UserModel.find({ $or: conditions })
    .select({ _id: 1 })
    .limit(MAX_SEARCH_USERS)
    .lean();
  return users.map((user) => user._id);
};

export interface QueueFilter {
  status: VerificationStatus;
  userIds?: Types.ObjectId[];
}

export const findQueuePage = async (
  filter: QueueFilter,
  paging: { skip: number; limit: number; sort: Record<string, 1 | -1> },
) => {
  const query = {
    status: filter.status,
    ...(filter.userIds ? { userId: { $in: filter.userIds } } : {}),
  };
  const [items, total] = await Promise.all([
    IdentityVerificationModel.find(query)
      .select(withoutImages)
      .sort(paging.sort)
      .skip(paging.skip)
      .limit(paging.limit)
      .lean(),
    IdentityVerificationModel.countDocuments(query),
  ]);
  return { items, total };
};

export const countByStatus = () =>
  IdentityVerificationModel.aggregate<{ _id: VerificationStatus; count: number }>([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

/** Submission times per user (one aggregate on the user_history index). */
export const findSubmissionTimes = async (
  userIds: Types.ObjectId[],
): Promise<Map<string, Date[]>> => {
  if (userIds.length === 0) return new Map();
  const groups = await IdentityVerificationModel.aggregate<{
    _id: Types.ObjectId;
    times: Date[];
  }>([
    { $match: { userId: { $in: userIds } } },
    { $group: { _id: '$userId', times: { $push: '$createdAt' } } },
  ]);
  return new Map(groups.map((group) => [String(group._id), group.times]));
};

export const findUsersByIds = (userIds: Types.ObjectId[]) =>
  UserModel.find({ _id: { $in: userIds } })
    .select(userFields)
    .lean();

export const findUserById = (userId: Types.ObjectId) =>
  UserModel.findById(userId).select(userFields).lean();

export const findVerificationById = (id: string) => IdentityVerificationModel.findById(id).lean();

export const findPreviousVerifications = (
  userId: Types.ObjectId,
  before: Date,
  excludeId: Types.ObjectId,
  limit = 20,
) =>
  IdentityVerificationModel.find({ userId, _id: { $ne: excludeId }, createdAt: { $lt: before } })
    .select(withoutImages)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

export const verificationExists = async (id: string, session: ClientSession): Promise<boolean> =>
  (await IdentityVerificationModel.exists({ _id: id }).session(session)) !== null;

export interface DecisionUpdate {
  status: Exclude<VerificationStatus, 'PENDING'>;
  reviewedBy: string;
  reviewedAt: Date;
  rejectReason?: string;
}

/** Conditional update: only a PENDING request moves, so two Admins cannot both decide it. */
export const decidePendingVerification = (
  id: string,
  decision: DecisionUpdate,
  session: ClientSession,
) =>
  IdentityVerificationModel.findOneAndUpdate(
    { _id: id, status: 'PENDING' },
    {
      $set: {
        status: decision.status,
        reviewedBy: new Types.ObjectId(decision.reviewedBy),
        reviewedAt: decision.reviewedAt,
        ...(decision.rejectReason ? { rejectReason: decision.rejectReason } : {}),
      },
      ...(decision.rejectReason ? {} : { $unset: { rejectReason: 1 } }),
    },
    { new: true, session, runValidators: true },
  )
    .select(withoutImages)
    .lean();

/**
 * Copies the decision onto users.identityStatus; returns the user as it was before. A rejection
 * never downgrades a user who is already VERIFIED: null then (also when the user is gone).
 */
export const setUserIdentityStatus = (
  userId: Types.ObjectId,
  identityStatus: IdentityStatus,
  session: ClientSession,
) =>
  UserModel.findOneAndUpdate(
    {
      _id: userId,
      ...(identityStatus === 'VERIFIED' ? {} : { identityStatus: { $ne: 'VERIFIED' } }),
    },
    { $set: { identityStatus } },
    { new: false, session, runValidators: true },
  )
    .select({ identityStatus: 1 })
    .lean();

export const userExists = async (userId: Types.ObjectId, session: ClientSession) =>
  (await UserModel.exists({ _id: userId }).session(session)) !== null;

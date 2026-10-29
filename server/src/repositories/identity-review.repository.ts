import type { Types } from 'mongoose';

import { phoneSearchDigits } from '../utils/phone.js';
import { accentInsensitivePattern, escapeRegex } from '../utils/text.js';
import { User } from '../models/user.model.js';
import type { VerificationStatus } from '../interfaces/identity-verification.ports.js';
import { IdentityVerification } from '../models/identity-verification.model.js';
import type { ReviewUser, VerificationSummary } from '../services/identity-review.mapper.js';

// Read side of the Admin identity review on develop's models. Decisions go through develop's
// IdentityVerificationService.review (identity-review.service.ts).

/** Upper bound of users a search may match, so the `$in` list stays small. */
export const MAX_SEARCH_USERS = 500;

const withoutImages = { frontImage: 0, backImage: 0, selfie: 0 } as const;

const userFields = {
  fullName: 1,
  phone: 1,
  email: 1,
  status: 1,
  lock: 1,
  verificationStatus: 1,
  createdAt: 1,
} as const;

/** Ids of the users whose name (accent-insensitive), email (prefix) or phone matches. */
export const findUserIdsMatching = async (search: string): Promise<Types.ObjectId[]> => {
  const conditions: Record<string, unknown>[] = [
    { fullName: { $regex: accentInsensitivePattern(search), $options: 'i' } },
    { email: { $regex: `^${escapeRegex(search.toLowerCase())}`, $options: 'i' } },
  ];
  if (/^[\d\s+().-]+$/.test(search)) {
    const digits = phoneSearchDigits(search);
    if (digits.length >= 3) conditions.push({ phone: { $regex: `${escapeRegex(digits)}$` } });
  }
  const users = await User.find({ $or: conditions })
    .select({ _id: 1 })
    .limit(MAX_SEARCH_USERS)
    .lean();
  return users.map((user) => user._id);
};

export interface QueueFilter {
  status: VerificationStatus;
  userIds?: Types.ObjectId[];
}

export type QueueRow = VerificationSummary & { userId: Types.ObjectId };

export const findQueuePage = async (
  filter: QueueFilter,
  paging: { skip: number; limit: number; sort: Record<string, 1 | -1> },
) => {
  const query = {
    status: filter.status,
    ...(filter.userIds ? { userId: { $in: filter.userIds } } : {}),
  };
  const [items, total] = await Promise.all([
    IdentityVerification.find(query)
      .select(withoutImages)
      .sort(paging.sort)
      .skip(paging.skip)
      .limit(paging.limit)
      .lean<QueueRow[]>(),
    IdentityVerification.countDocuments(query),
  ]);
  return { items, total };
};

export const countByStatus = () =>
  IdentityVerification.aggregate<{ _id: VerificationStatus; count: number }>([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

/** Submission times per user (index user_history). */
export const findSubmissionTimes = async (
  userIds: Types.ObjectId[],
): Promise<Map<string, Date[]>> => {
  if (userIds.length === 0) return new Map();
  const groups = await IdentityVerification.aggregate<{ _id: Types.ObjectId; times: Date[] }>([
    { $match: { userId: { $in: userIds } } },
    { $group: { _id: '$userId', times: { $push: '$submittedAt' } } },
  ]);
  return new Map(groups.map((group) => [String(group._id), group.times]));
};

export const findUsersByIds = (userIds: Types.ObjectId[]) =>
  User.find({ _id: { $in: userIds } })
    .select(userFields)
    .lean<ReviewUser[]>();

export const findUserById = (userId: Types.ObjectId) =>
  User.findById(userId).select(userFields).lean<ReviewUser>();

export const findVerificationById = (id: string) => IdentityVerification.findById(id).lean();

export const findPreviousVerifications = (
  userId: Types.ObjectId,
  before: Date,
  excludeId: Types.ObjectId,
  limit = 20,
) =>
  IdentityVerification.find({ userId, _id: { $ne: excludeId }, submittedAt: { $lt: before } })
    .select(withoutImages)
    .sort({ submittedAt: -1 })
    .limit(limit)
    .lean<VerificationSummary[]>();

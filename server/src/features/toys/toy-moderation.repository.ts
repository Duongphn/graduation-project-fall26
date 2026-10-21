import mongoose, { Types, type ClientSession } from 'mongoose';

import { Category } from '../categories/categories.model.js';
import { User } from '../users/users.model.js';
import { accentInsensitivePattern } from '../../shared/utils/text.js';
import { Toy } from './toys.model.js';
import type { ModerationListingType, ModerationToyStatus } from './toy-moderation.schemas.js';

// Database access of the Admin moderation screens, on develop's toys / users / categories models.

export interface ToyQueueFilter {
  status?: ModerationToyStatus | undefined;
  listingType?: ModerationListingType | undefined;
  categoryId?: string | undefined;
  q?: string | undefined;
}

export type ToySort = Record<string, 1 | -1>;

const OBJECT_ID = /^[a-f0-9]{24}$/i;
// Below this length a word search is too short for the text index: match a title prefix instead.
const TEXT_SEARCH_MIN_LENGTH = 3;
const ACTIVE_STATUS = /^active$/i;

const toMongoFilter = (filter: ToyQueueFilter): Record<string, unknown> => {
  const mongo: Record<string, unknown> = {};
  if (filter.status) mongo.status = filter.status;
  if (filter.listingType) mongo.listingType = filter.listingType;
  if (filter.categoryId) mongo.categoryId = new Types.ObjectId(filter.categoryId);
  const search = filter.q;
  if (search) {
    if (OBJECT_ID.test(search)) {
      mongo._id = new Types.ObjectId(search);
    } else if (search.length >= TEXT_SEARCH_MIN_LENGTH) {
      // Index keyword_search (title + description).
      mongo.$text = { $search: search };
    } else {
      mongo.title = { $regex: `^${accentInsensitivePattern(search)}`, $options: 'i' };
    }
  }
  return mongo;
};

export interface ToyRow {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  categoryId: Types.ObjectId;
  title: string;
  description?: string;
  condition: string;
  listingType: ModerationListingType;
  priceOrRate: number;
  depositPrice?: number;
  status: ModerationToyStatus;
  ageRange: { minAge: number; maxAge: number };
  images: { url: string; publicId: string }[];
  moderation?: {
    submittedAt?: Date;
    reviewedBy?: Types.ObjectId;
    reviewedAt?: Date;
    rejectReason?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryRow {
  _id: Types.ObjectId;
  name: string;
  status: string;
}

export interface OwnerRow {
  _id: Types.ObjectId;
  fullName: string;
  phone: string;
  status: 'ACTIVE' | 'LOCKED';
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  trust?: { score?: number };
  lock?: { until?: Date };
  createdAt: Date;
}

const queueProjection = {
  title: 1,
  listingType: 1,
  status: 1,
  condition: 1,
  ageRange: 1,
  priceOrRate: 1,
  depositPrice: 1,
  images: 1,
  categoryId: 1,
  ownerId: 1,
  moderation: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

const ownerProjection = {
  fullName: 1,
  phone: 1,
  status: 1,
  verificationStatus: 1,
  trust: 1,
  lock: 1,
  createdAt: 1,
} as const;

export const findQueueToys = async (
  filter: ToyQueueFilter,
  paging: { sort: ToySort; skip: number; limit: number },
): Promise<ToyRow[]> =>
  (await Toy.find(toMongoFilter(filter), queueProjection)
    .sort(paging.sort)
    .skip(paging.skip)
    .limit(paging.limit)
    .lean()) as unknown as ToyRow[];

export const countToys = (filter: ToyQueueFilter) => Toy.countDocuments(toMongoFilter(filter));

export const countToysByStatus = (filter: Omit<ToyQueueFilter, 'status'>) =>
  Toy.aggregate<{ _id: string; count: number }>([
    { $match: toMongoFilter(filter) },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

export const findToyById = async (id: string, session?: ClientSession): Promise<ToyRow | null> =>
  (await Toy.findById(id, null, { session: session ?? null }).lean()) as unknown as ToyRow | null;

export const findCategoriesByIds = async (ids: readonly Types.ObjectId[]): Promise<CategoryRow[]> =>
  (await Category.find({ _id: { $in: ids } }, { name: 1, status: 1 }).lean()) as CategoryRow[];

export const findCategoryById = async (
  id: Types.ObjectId,
  session?: ClientSession,
): Promise<CategoryRow | null> =>
  (await Category.findById(id, { name: 1, status: 1 }, { session: session ?? null }).lean()) as
    | CategoryRow
    | null;

export const findOwnersByIds = async (ids: readonly Types.ObjectId[]): Promise<OwnerRow[]> =>
  (await User.find({ _id: { $in: ids } }, ownerProjection).lean()) as unknown as OwnerRow[];

export const findUserNameById = (id: Types.ObjectId) => User.findById(id, { fullName: 1 }).lean();

/** Runs `work` in a MongoDB transaction (needs a replica set). */
export const withTransaction = async <T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
};

// ---- Decisions ----

interface DecisionWrite {
  toyId: Types.ObjectId;
  // The stale-edit token: the post must still have this updatedAt (and be pending).
  expectedUpdatedAt: Date;
  reviewerId: string;
  reviewedAt: Date;
  session: ClientSession;
}

const pendingAndUnchanged = (write: DecisionWrite) => ({
  _id: write.toyId,
  status: 'pending',
  updatedAt: write.expectedUpdatedAt,
});

/** pending -> active. Null when the post changed or was decided meanwhile. */
export const approvePending = async (write: DecisionWrite): Promise<ToyRow | null> =>
  (await Toy.findOneAndUpdate(
    pendingAndUnchanged(write),
    {
      $set: {
        status: 'active',
        'moderation.reviewedBy': new Types.ObjectId(write.reviewerId),
        'moderation.reviewedAt': write.reviewedAt,
      },
      $unset: { 'moderation.rejectReason': 1 },
    },
    { new: true, session: write.session },
  ).lean()) as unknown as ToyRow | null;

/** pending -> hidden with the reason shown to the Owner. Null as for approvePending. */
export const rejectPending = async (
  write: DecisionWrite & { reason: string },
): Promise<ToyRow | null> =>
  (await Toy.findOneAndUpdate(
    pendingAndUnchanged(write),
    {
      $set: {
        status: 'hidden',
        'moderation.reviewedBy': new Types.ObjectId(write.reviewerId),
        'moderation.reviewedAt': write.reviewedAt,
        'moderation.rejectReason': write.reason,
      },
    },
    { new: true, session: write.session },
  ).lean()) as unknown as ToyRow | null;

/**
 * Writes the category document (bumps __v) only while it is active, inside the approve
 * transaction, so approve and a concurrent hide/delete of the category write-conflict.
 */
export const lockActiveCategory = (id: Types.ObjectId, session: ClientSession) =>
  Category.findOneAndUpdate(
    { _id: id, status: { $regex: ACTIVE_STATUS } },
    { $inc: { __v: 1 } },
    { new: true, session, projection: { name: 1, status: 1 } },
  ).lean();

export type DecisionOwner = Pick<OwnerRow, 'verificationStatus' | 'status' | 'lock'>;

/** The owner fields the approval gate needs (only a verified, unlocked owner). */
export const findOwnerForDecision = async (
  id: Types.ObjectId,
  session: ClientSession,
): Promise<DecisionOwner | null> =>
  (await User.findById(
    id,
    { verificationStatus: 1, status: 1, lock: 1 },
    { session },
  ).lean()) as DecisionOwner | null;

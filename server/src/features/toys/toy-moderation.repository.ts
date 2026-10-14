import { Types, type ClientSession } from 'mongoose';

import { CategoryModel } from '../categories/categories.model.js';
import {
  settingDefaults,
  SystemSettingModel,
  type SettingKey,
} from '../system_settings/system_settings.model.js';
import { UserModel } from '../users/users.model.js';
import type { ListingType } from '../../shared/domain/enums.js';
import type { ToyStatus } from '../../shared/domain/statuses.js';
import { accentInsensitivePattern } from '../../shared/utils/text.js';
import { ToyModel } from './toys.model.js';

// Database access of the Admin moderation screens. Only this file touches the models (rule 6).

export interface ToyQueueFilter {
  status?: ToyStatus | undefined;
  listingType?: ListingType | undefined;
  categoryId?: string | undefined;
  q?: string | undefined;
}

export type ToySort = Record<string, 1 | -1>;

const OBJECT_ID = /^[a-f0-9]{24}$/i;
// Below this length a word search is too short for the text index: match a title prefix instead.
const TEXT_SEARCH_MIN_LENGTH = 3;

const toMongoFilter = (filter: ToyQueueFilter): Record<string, unknown> => {
  const mongo: Record<string, unknown> = {};
  if (filter.status) mongo.status = filter.status;
  if (filter.listingType) mongo.listingType = filter.listingType;
  if (filter.categoryId) mongo.categoryId = new Types.ObjectId(filter.categoryId);
  const search = filter.q;
  if (search) {
    if (OBJECT_ID.test(search)) {
      // An Admin may paste the id of a post.
      mongo._id = new Types.ObjectId(search);
    } else if (search.length >= TEXT_SEARCH_MIN_LENGTH) {
      // Index keyword_search (title + description), diacritic insensitive.
      mongo.$text = { $search: search };
    } else {
      mongo.title = { $regex: `^${accentInsensitivePattern(search)}`, $options: 'i' };
    }
  }
  return mongo;
};

// Fields of a queue row; the description and location are only read on the detail page.
const queueProjection = {
  title: 1,
  listingType: 1,
  status: 1,
  condition: 1,
  ageGroup: 1,
  pricing: 1,
  area: 1,
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
  dateOfBirth: 1,
  status: 1,
  identityStatus: 1,
  trust: 1,
  lock: 1,
  createdAt: 1,
} as const;

export const findQueueToys = (
  filter: ToyQueueFilter,
  paging: { sort: ToySort; skip: number; limit: number },
) =>
  ToyModel.find(toMongoFilter(filter), queueProjection)
    .sort(paging.sort)
    .skip(paging.skip)
    .limit(paging.limit)
    .lean();

export const countToys = (filter: ToyQueueFilter) => ToyModel.countDocuments(toMongoFilter(filter));

export const countToysByStatus = (filter: Omit<ToyQueueFilter, 'status'>) =>
  ToyModel.aggregate<{ _id: ToyStatus; count: number }>([
    { $match: toMongoFilter(filter) },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

export const findToyById = (id: string, session?: ClientSession) =>
  ToyModel.findById(id, null, { session: session ?? null }).lean();

export const findCategoriesByIds = (ids: readonly Types.ObjectId[]) =>
  CategoryModel.find({ _id: { $in: ids } }, { name: 1, status: 1 }).lean();

export const findCategoryById = (id: Types.ObjectId, session?: ClientSession) =>
  CategoryModel.findById(id, { name: 1, status: 1 }, { session: session ?? null }).lean();

export const findOwnersByIds = (ids: readonly Types.ObjectId[]) =>
  UserModel.find({ _id: { $in: ids } }, ownerProjection).lean();

export const findUserNameById = (id: Types.ObjectId) =>
  UserModel.findById(id, { fullName: 1 }).lean();

/** Numeric settings by key, with the default of each key when it is missing or not a number. */
export const findNumberSettings = async <K extends SettingKey>(
  keys: readonly K[],
): Promise<Record<K, number | undefined>> => {
  const rows = await SystemSettingModel.find({ key: { $in: keys } }, { key: 1, value: 1 }).lean();
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  return Object.fromEntries(
    keys.map((key) => {
      const value = stored.get(key);
      return [
        key,
        typeof value === 'number' && Number.isFinite(value) ? value : settingDefaults[key],
      ];
    }),
  ) as Record<K, number | undefined>;
};

// ---- Decisions ----

interface DecisionWrite {
  toyId: Types.ObjectId;
  // The stale-edit token: the post must still have this updatedAt (and be PENDING_REVIEW).
  expectedUpdatedAt: Date;
  reviewerId: string;
  reviewedAt: Date;
  session: ClientSession;
}

const pendingAndUnchanged = (write: DecisionWrite) => ({
  _id: write.toyId,
  status: 'PENDING_REVIEW',
  updatedAt: write.expectedUpdatedAt,
});

/** PENDING_REVIEW -> ACTIVE. Returns null when the post changed or was decided meanwhile. */
export const approvePending = (write: DecisionWrite) =>
  ToyModel.findOneAndUpdate(
    pendingAndUnchanged(write),
    {
      $set: {
        status: 'ACTIVE',
        'moderation.reviewedBy': new Types.ObjectId(write.reviewerId),
        'moderation.reviewedAt': write.reviewedAt,
      },
      $unset: { 'moderation.rejectReason': 1 },
    },
    { new: true, session: write.session, runValidators: true },
  ).lean();

/** PENDING_REVIEW -> REJECTED with the reason shown to the Owner. Null as for approvePending. */
export const rejectPending = (write: DecisionWrite & { reason: string }) =>
  ToyModel.findOneAndUpdate(
    pendingAndUnchanged(write),
    {
      $set: {
        status: 'REJECTED',
        'moderation.reviewedBy': new Types.ObjectId(write.reviewerId),
        'moderation.reviewedAt': write.reviewedAt,
        'moderation.rejectReason': write.reason,
      },
    },
    { new: true, session: write.session, runValidators: true },
  ).lean();

/**
 * Writes the category document (bumps __v) only while it is ACTIVE, inside the approve
 * transaction: approve and a concurrent hide/delete of the category then write-conflict, so a
 * toy never becomes ACTIVE in a hidden or deleted category (categories/README.md). Null when
 * the category is not ACTIVE (or gone).
 */
export const lockActiveCategory = (id: Types.ObjectId, session: ClientSession) =>
  CategoryModel.findOneAndUpdate(
    { _id: id, status: 'ACTIVE' },
    { $inc: { __v: 1 } },
    { new: true, session, projection: { name: 1, status: 1 } },
  ).lean();

/** The owner fields the approval gate needs (BF-01: only a verified, unlocked owner). */
export const findOwnerForDecision = (id: Types.ObjectId, session: ClientSession) =>
  UserModel.findById(id, { identityStatus: 1, status: 1, lock: 1 }, { session }).lean();

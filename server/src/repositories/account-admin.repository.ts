import { Types, type ClientSession, type PipelineStage } from 'mongoose';

import { RefreshToken } from '../models/refresh-token.model.js';
import { Toy } from '../models/toy.model.js';
import { User, type IUser } from '../models/user.model.js';
import { ViolationReport } from '../models/violation-report.model.js';
import { phoneSearchDigits } from '../utils/phone.js';
import { accentInsensitivePattern, escapeRegex } from '../utils/text.js';

export { withTransaction } from '../utils/transaction.js';

// Users, their toys and sessions as the Admin account management needs them (UC29).

export type AccountRecord = Pick<
  IUser,
  | '_id'
  | 'fullName'
  | 'phone'
  | 'email'
  | 'avatar'
  | 'role'
  | 'status'
  | 'verificationStatus'
  | 'trust'
  | 'lock'
  | 'createdAt'
>;

const ACCOUNT_FIELDS =
  'fullName phone email avatar role status verificationStatus trust lock createdAt';

export const findAccountById = (id: string | Types.ObjectId, session?: ClientSession) =>
  User.findById(id)
    .select(ACCOUNT_FIELDS)
    .session(session ?? null)
    .lean<AccountRecord>();

/** The Admin lock of an account, read by `authenticate` on every request. */
export const findLockOf = (id: string) =>
  User.findById(id).select('status lock.until lock.reason').lean<Pick<IUser, 'status' | 'lock'>>();

// ---- Lock / unlock ----

/**
 * Locks the account if it is not under an Admin lock already (a lock that has ended counts as
 * unlocked). Returns null when another Admin locked it first.
 */
export const setAdminLock = (
  id: Types.ObjectId,
  lock: { until?: Date; reason: string; lockedAt: Date; lockedBy: Types.ObjectId; hiddenToyIds: Types.ObjectId[] },
  now: Date,
  session: ClientSession,
) =>
  User.findOneAndUpdate(
    {
      _id: id,
      $or: [{ status: 'ACTIVE' }, { status: 'LOCKED', 'lock.until': { $lte: now } }],
    },
    {
      $set: {
        status: 'LOCKED',
        'lock.reason': lock.reason,
        'lock.lockedAt': lock.lockedAt,
        'lock.lockedBy': lock.lockedBy,
        'lock.hiddenToyIds': lock.hiddenToyIds,
        ...(lock.until ? { 'lock.until': lock.until } : {}),
      },
      ...(lock.until ? {} : { $unset: { 'lock.until': 1 } }),
    },
    { new: true, session },
  ).lean<AccountRecord>();

/** Ends an Admin lock. `expiredOnly` only ends a timed lock that has run out (the job). */
export const clearAdminLock = (
  id: Types.ObjectId,
  session: ClientSession,
  options: { expiredBefore?: Date } = {},
) =>
  User.findOneAndUpdate(
    {
      _id: id,
      status: 'LOCKED',
      ...(options.expiredBefore ? { 'lock.until': { $lte: options.expiredBefore } } : {}),
    },
    { $set: { status: 'ACTIVE' }, $unset: { lock: 1 } },
    { new: false, session },
  ).lean<AccountRecord>();

/** Timed Admin locks that have run out. */
export const findExpiredLockIds = async (now: Date, limit = 200): Promise<Types.ObjectId[]> =>
  (
    await User.find({ status: 'LOCKED', 'lock.until': { $lte: now } })
      .select('_id')
      .limit(limit)
      .lean<Array<{ _id: Types.ObjectId }>>()
  ).map((row) => row._id);

/** Hides the owner's Active listings; returns their ids so an unlock can show them again. */
export const hideActiveToysOf = async (
  ownerId: Types.ObjectId,
  session: ClientSession,
): Promise<Types.ObjectId[]> => {
  const ids = (
    await Toy.find({ ownerId, status: 'active' })
      .select('_id')
      .session(session)
      .lean<Array<{ _id: Types.ObjectId }>>()
  ).map((row) => row._id);
  if (ids.length > 0) {
    await Toy.updateMany({ _id: { $in: ids }, status: 'active' }, { $set: { status: 'hidden' } }, { session });
  }
  return ids;
};

/**
 * Shows again the listings a lock hid, unless they were removed for a violation meanwhile (a
 * removed listing keeps its reject reason) or changed status.
 */
export const restoreToys = async (ids: Types.ObjectId[], session: ClientSession): Promise<number> => {
  if (ids.length === 0) return 0;
  const result = await Toy.updateMany(
    { _id: { $in: ids }, status: 'hidden', 'moderation.rejectReason': { $exists: false } },
    { $set: { status: 'active' } },
    { session },
  );
  return result.modifiedCount;
};

/** Ends every session of the user (R03 III.7.2.1 (10)): refresh tokens are deleted. */
export const revokeSessions = (userId: Types.ObjectId, session: ClientSession) =>
  RefreshToken.deleteMany({ userId }, { session });

export const countActiveToysOf = (ownerId: Types.ObjectId) =>
  Toy.countDocuments({ ownerId, status: 'active' });

export const findUserNames = async (ids: Types.ObjectId[]) => {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await User.find({ _id: { $in: ids } })
    .select('fullName')
    .lean<Array<{ _id: Types.ObjectId; fullName: string }>>();
  return new Map(rows.map((row) => [String(row._id), row.fullName]));
};

// ---- List ----

export interface AccountFilter {
  role?: 'USER' | 'ADMIN' | undefined;
  q?: string | undefined;
}

export type AccountTab = 'all' | 'active' | 'locked' | 'reported';

const searchMatch = (q: string | undefined): Record<string, unknown> => {
  if (!q) return {};
  const digits = phoneSearchDigits(q);
  return {
    $or: [
      { fullName: { $regex: accentInsensitivePattern(q), $options: 'i' } },
      { email: { $regex: escapeRegex(q.toLowerCase()), $options: 'i' } },
      ...(digits.length >= 3 ? [{ phone: { $regex: escapeRegex(digits) } }] : []),
    ],
  };
};

/** Locked = an Admin lock that is still running. */
const lockedMatch = (now: Date) => ({
  status: 'LOCKED',
  $or: [{ 'lock.until': { $exists: false } }, { 'lock.until': { $gt: now } }],
});

const tabMatch = async (tab: AccountTab, now: Date): Promise<Record<string, unknown>> => {
  if (tab === 'locked') return lockedMatch(now);
  if (tab === 'active') return { $nor: [lockedMatch(now)] };
  if (tab === 'reported') {
    const ids = await ViolationReport.distinct('target.userId', { status: 'pending' });
    return { _id: { $in: ids } };
  }
  return {};
};

export type AccountRow = AccountRecord & { violationCount: number; pendingReportCount: number };

const withReportCounts: PipelineStage[] = [
  {
    $lookup: {
      from: ViolationReport.collection.name,
      let: { userId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$target.userId', '$$userId'] } } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ],
      as: 'reportCounts',
    },
  },
  {
    $addFields: {
      violationCount: {
        $sum: {
          $map: {
            input: { $filter: { input: '$reportCounts', cond: { $eq: ['$$this._id', 'resolved'] } } },
            in: '$$this.n',
          },
        },
      },
      pendingReportCount: {
        $sum: {
          $map: {
            input: { $filter: { input: '$reportCounts', cond: { $eq: ['$$this._id', 'pending'] } } },
            in: '$$this.n',
          },
        },
      },
    },
  },
];

export const listAccounts = async (
  tab: AccountTab,
  filter: AccountFilter,
  paging: { skip: number; limit: number; sort: Record<string, 1 | -1> },
  now: Date,
): Promise<{ rows: AccountRow[]; total: number }> => {
  const match = {
    ...(filter.role ? { role: filter.role } : {}),
    ...searchMatch(filter.q),
  };
  const [result] = await User.aggregate<{ rows: AccountRow[]; total: Array<{ n: number }> }>([
    { $match: { $and: [match, await tabMatch(tab, now)] } },
    ...withReportCounts,
    {
      $facet: {
        rows: [
          { $sort: paging.sort },
          { $skip: paging.skip },
          { $limit: paging.limit },
          {
            $project: {
              ...Object.fromEntries(ACCOUNT_FIELDS.split(' ').map((field) => [field, 1])),
              violationCount: 1,
              pendingReportCount: 1,
            },
          },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);
  return { rows: result?.rows ?? [], total: result?.total[0]?.n ?? 0 };
};

export const countAccounts = async (
  tab: AccountTab,
  filter: AccountFilter,
  now: Date,
): Promise<number> =>
  User.countDocuments({
    $and: [
      { ...(filter.role ? { role: filter.role } : {}), ...searchMatch(filter.q) },
      await tabMatch(tab, now),
    ],
  });

export const countReportsAgainst = async (userId: Types.ObjectId) => {
  const rows = await ViolationReport.aggregate<{ _id: string; n: number }>([
    { $match: { 'target.userId': userId } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const of = (status: string) => rows.find((row) => row._id === status)?.n ?? 0;
  return { violationCount: of('resolved'), pendingReportCount: of('pending') };
};

export const findResolvedReportsAgainst = (userId: Types.ObjectId, limit = 50) =>
  ViolationReport.find({ 'target.userId': userId, status: 'resolved' })
    .sort({ 'resolution.resolvedAt': -1, _id: -1 })
    .limit(limit)
    .lean();

import { Types, type ClientSession, type PipelineStage } from 'mongoose';

import { RefreshToken } from '../models/refresh-token.model.js';
import { RentalOrder, type IRentalOrder } from '../models/rental-order.model.js';
import { Toy } from '../models/toy.model.js';
import { User, type IUser } from '../models/user.model.js';
import { ViolationReport } from '../models/violation-report.model.js';
import { DEFAULT_RENTAL_SETTINGS } from '../types/rental-order.types.js';
import { phoneSearchDigits } from '../utils/phone.js';
import { accentInsensitivePattern, escapeRegex } from '../utils/text.js';
import type { AccountTrustBand } from '../validations/account-admin.validation.js';

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
  | 'lastLoginAt'
  | 'createdAt'
>;

const ACCOUNT_FIELDS =
  'fullName phone email avatar role status verificationStatus trust lock lastLoginAt createdAt';

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
  trustBand?: AccountTrustBand | undefined;
  q?: string | undefined;
}

export type AccountTab = 'all' | 'active' | 'locked' | 'reported';

/** GB-29: every account starts at 100; an account with no score stored yet counts as 100. */
export const STARTING_TRUST_SCORE = 100;

const trustBandMatch = (band: AccountTrustBand | undefined): Record<string, unknown> => {
  const threshold = DEFAULT_RENTAL_SETTINGS.minTrustScore;
  if (band === 'low') return { 'trust.score': { $lt: threshold } };
  if (band === 'medium') return { 'trust.score': { $gte: threshold, $lt: STARTING_TRUST_SCORE } };
  if (band === 'full') {
    return { $or: [{ 'trust.score': { $gte: STARTING_TRUST_SCORE } }, { 'trust.score': null }] };
  }
  return {};
};

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

/** Role, search and Trust Score band; each its own $and item, as two of them use $or. */
const filterMatch = (filter: AccountFilter): Array<Record<string, unknown>> => [
  filter.role ? { role: filter.role } : {},
  searchMatch(filter.q),
  trustBandMatch(filter.trustBand),
];

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

/**
 * A report that records an Admin decision: resolved, and not closed together with another report
 * on the same target (those carry resolution.viaReportId).
 */
const DECISION_FILTER = { status: 'resolved', 'resolution.viaReportId': null };
const isDecision = {
  $and: [
    { $eq: ['$status', 'resolved'] },
    { $eq: [{ $ifNull: ['$resolution.viaReportId', null] }, null] },
  ],
};

/** A rental whose dispute was ruled against the Renter or the Owner (UC19). */
const isRulingAgainst = (ruling: 'RENTER_AT_FAULT' | 'OWNER_AT_FAULT') => ({
  $and: [
    { $eq: ['$settlement.resolution.ruling', ruling] },
    { $ne: [{ $ifNull: ['$settlement.disputeId', null] }, null] },
  ],
});

/**
 * Violation count and pending reports of each user (R03 III.7.2.1 (6)-(7)). One violation per
 * entry of the violation history: one per Admin decision on violation reports (a decision that
 * closed several reports on the same target counts once), one per dispute ruled against the user
 * and one per late return.
 */
const withViolationCounts: PipelineStage[] = [
  {
    $lookup: {
      from: ViolationReport.collection.name,
      let: { userId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$target.userId', '$$userId'] } } },
        {
          $group: {
            _id: null,
            decisions: { $sum: { $cond: [isDecision, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          },
        },
      ],
      as: 'reportCounts',
    },
  },
  {
    $lookup: {
      from: RentalOrder.collection.name,
      let: { userId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$renterId', '$$userId'] } } },
        {
          $group: {
            _id: null,
            n: {
              $sum: {
                $add: [
                  { $cond: [{ $gt: ['$returnInfo.lateDays', 0] }, 1, 0] },
                  { $cond: [isRulingAgainst('RENTER_AT_FAULT'), 1, 0] },
                ],
              },
            },
          },
        },
      ],
      as: 'asRenter',
    },
  },
  {
    $lookup: {
      from: RentalOrder.collection.name,
      let: { userId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$ownerId', '$$userId'] } } },
        { $group: { _id: null, n: { $sum: { $cond: [isRulingAgainst('OWNER_AT_FAULT'), 1, 0] } } } },
      ],
      as: 'asOwner',
    },
  },
  {
    $addFields: {
      violationCount: {
        $add: [{ $sum: '$reportCounts.decisions' }, { $sum: '$asRenter.n' }, { $sum: '$asOwner.n' }],
      },
      pendingReportCount: { $sum: '$reportCounts.pending' },
    },
  },
];

export const listAccounts = async (
  tab: AccountTab,
  filter: AccountFilter,
  paging: { skip: number; limit: number; sort: Record<string, 1 | -1> },
  now: Date,
): Promise<{ rows: AccountRow[]; total: number }> => {
  const [result] = await User.aggregate<{ rows: AccountRow[]; total: Array<{ n: number }> }>([
    { $match: { $and: [...filterMatch(filter), await tabMatch(tab, now)] } },
    ...withViolationCounts,
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
  User.countDocuments({ $and: [...filterMatch(filter), await tabMatch(tab, now)] });

/** The violation count and the pending reports of one user, counted as in the list. */
export const countViolationsOf = async (
  userId: Types.ObjectId,
): Promise<{ violationCount: number; pendingReportCount: number }> => {
  const [row] = await User.aggregate<{ violationCount: number; pendingReportCount: number }>([
    { $match: { _id: userId } },
    ...withViolationCounts,
    { $project: { _id: 0, violationCount: 1, pendingReportCount: 1 } },
  ]);
  return row ?? { violationCount: 0, pendingReportCount: 0 };
};

// ---- Activity (R03 III.7.2.1 (6)-(7)) ----

/** Completed rentals of the user, as Renter or as Owner. */
export const countCompletedBookingsOf = (userId: Types.ObjectId) =>
  RentalOrder.countDocuments({ status: 'COMPLETED', $or: [{ renterId: userId }, { ownerId: userId }] });

export type RentalBreachRecord = Pick<
  IRentalOrder,
  '_id' | 'code' | 'renterId' | 'ownerId' | 'returnInfo' | 'settlement'
>;

/** Rentals where the user broke a rule: a late return, or a dispute ruled against them (UC19). */
export const findRentalBreachesOf = (userId: Types.ObjectId, limit = 50) =>
  RentalOrder.find({
    $or: [
      { renterId: userId, 'returnInfo.lateDays': { $gt: 0 } },
      {
        renterId: userId,
        'settlement.resolution.ruling': 'RENTER_AT_FAULT',
        'settlement.disputeId': { $exists: true },
      },
      {
        ownerId: userId,
        'settlement.resolution.ruling': 'OWNER_AT_FAULT',
        'settlement.disputeId': { $exists: true },
      },
    ],
  })
    .select('code renterId ownerId returnInfo settlement.disputeId settlement.resolution')
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit)
    .lean<RentalBreachRecord[]>();

/** Admin decisions on reports against the user, newest first, with the number of reports each closed. */
export const findReportDecisionsAgainst = async (userId: Types.ObjectId, limit = 50) => {
  const decisions = await ViolationReport.find({ 'target.userId': userId, ...DECISION_FILTER })
    .sort({ 'resolution.resolvedAt': -1, _id: -1 })
    .limit(limit)
    .lean();
  const closedWith =
    decisions.length === 0
      ? []
      : await ViolationReport.aggregate<{ _id: Types.ObjectId; n: number }>([
          { $match: { 'resolution.viaReportId': { $in: decisions.map((report) => report._id) } } },
          { $group: { _id: '$resolution.viaReportId', n: { $sum: 1 } } },
        ]);
  const others = new Map(closedWith.map((row) => [String(row._id), row.n]));
  return decisions.map((report) => ({
    ...report,
    reportCount: 1 + (others.get(String(report._id)) ?? 0),
  }));
};

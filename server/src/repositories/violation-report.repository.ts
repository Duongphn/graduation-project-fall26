import { Types, type ClientSession, type Model } from 'mongoose';

import type { ReportStatus, ReportTargetKind } from '../constants/violation-report.js';
import { Conversation } from '../models/conversation.model.js';
import { Message } from '../models/message.model.js';
import { Toy } from '../models/toy.model.js';
import { User } from '../models/user.model.js';
import { ViolationReport, type IViolationReport } from '../models/violation-report.model.js';

export { withTransaction } from '../utils/transaction.js';

// Violation reports (UC28, UC29) and the records they point to. The chat models are only read.

export type ReportRecord = IViolationReport;

export interface ToyTarget {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  title: string;
  status: 'pending' | 'active' | 'hidden';
  listingType: string;
  images: Array<{ url: string }>;
  moderation?: { rejectReason?: string };
}

export interface UserTarget {
  _id: Types.ObjectId;
  fullName: string;
  phone: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'LOCKED';
  lock?: { until?: Date };
}

export interface MessageTarget {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  content: string;
  createdAt: Date;
}

// The chat models are untyped on develop; only these fields are read.
const Messages = Message as unknown as Model<Omit<MessageTarget, '_id'>>;

const TOY_FIELDS = 'ownerId title status listingType images moderation.rejectReason';
const USER_FIELDS = 'fullName phone role status lock.until';

export const findToy = (id: string | Types.ObjectId, session?: ClientSession) =>
  Toy.findById(id).select(TOY_FIELDS).session(session ?? null).lean<ToyTarget>();

export const findUser = (id: string | Types.ObjectId) =>
  User.findById(id).select(USER_FIELDS).lean<UserTarget>();

export const findMessage = (id: string | Types.ObjectId) =>
  Messages.findById(id).select('conversationId senderId content createdAt').lean<MessageTarget>();

export const isConversationParticipant = async (
  conversationId: Types.ObjectId,
  userId: string,
): Promise<boolean> =>
  (await Conversation.exists({
    _id: conversationId,
    'participants.userId': new Types.ObjectId(userId),
  })) !== null;

// ---- Reports ----

export const hasPendingReport = async (
  reporterId: string,
  kind: ReportTargetKind,
  targetId: string,
): Promise<boolean> =>
  (await ViolationReport.exists({
    reporterId: new Types.ObjectId(reporterId),
    'target.kind': kind,
    'target.id': new Types.ObjectId(targetId),
    status: 'pending',
  })) !== null;

export const countReportsSince = (reporterId: string, since: Date) =>
  ViolationReport.countDocuments({
    reporterId: new Types.ObjectId(reporterId),
    createdAt: { $gte: since },
  });

export const insertReport = async (data: Record<string, unknown>): Promise<ReportRecord> => {
  const created = await ViolationReport.create(data);
  return created.toObject() as ReportRecord;
};

export interface ReportFilter {
  status?: ReportStatus | undefined;
  reason?: string | undefined;
  targetKind?: ReportTargetKind | undefined;
  reportedUserId?: string | undefined;
}

const toQuery = (filter: ReportFilter) => ({
  ...(filter.status ? { status: filter.status } : {}),
  ...(filter.reason ? { reason: filter.reason } : {}),
  ...(filter.targetKind ? { 'target.kind': filter.targetKind } : {}),
  ...(filter.reportedUserId ? { 'target.userId': new Types.ObjectId(filter.reportedUserId) } : {}),
});

export const findReports = (
  filter: ReportFilter,
  paging: { skip: number; limit: number; sort: Record<string, 1 | -1> },
) =>
  ViolationReport.find(toQuery(filter))
    .sort(paging.sort)
    .skip(paging.skip)
    .limit(paging.limit)
    .lean<ReportRecord[]>();

export const countReports = (filter: ReportFilter) =>
  ViolationReport.countDocuments(toQuery(filter));

export const countReportsByStatus = (filter: Omit<ReportFilter, 'status'>) =>
  ViolationReport.aggregate<{ _id: string; count: number }>([
    { $match: toQuery(filter) },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

export const findReportById = (id: string, session?: ClientSession) =>
  ViolationReport.findById(id).session(session ?? null).lean<ReportRecord>();

/** Pending reports on the same target, other than `exceptId`. */
export const findOtherPendingOnTarget = (
  report: Pick<ReportRecord, '_id' | 'target'>,
  session?: ClientSession,
) =>
  ViolationReport.find({
    _id: { $ne: report._id },
    'target.kind': report.target.kind,
    'target.id': report.target.id,
    status: 'pending',
  })
    .select('_id reporterId')
    .session(session ?? null)
    .lean<Array<{ _id: Types.ObjectId; reporterId: Types.ObjectId }>>();

/** Closes pending reports; only those still pending are changed. */
export const closeReports = async (
  ids: Types.ObjectId[],
  update: {
    status: 'resolved' | 'dismissed';
    resolvedBy: Types.ObjectId;
    resolution: Record<string, unknown>;
  },
  session: ClientSession,
): Promise<number> => {
  const result = await ViolationReport.updateMany(
    { _id: { $in: ids }, status: 'pending' },
    { $set: update },
    { session },
  );
  return result.modifiedCount;
};

/** Hides a reported toy post for a violation, with the reason the Owner sees. */
export const removeToy = (
  toyId: Types.ObjectId,
  reason: string,
  reviewerId: Types.ObjectId,
  session: ClientSession,
) =>
  Toy.findOneAndUpdate(
    { _id: toyId, status: { $in: ['active', 'pending', 'hidden'] } },
    {
      $set: {
        status: 'hidden',
        'moderation.rejectReason': reason,
        'moderation.reviewedBy': reviewerId,
        'moderation.reviewedAt': new Date(),
      },
    },
    { new: true, session },
  ).lean<ToyTarget>();

export const findToysByIds = (ids: Types.ObjectId[]) =>
  ids.length === 0
    ? Promise.resolve([] as ToyTarget[])
    : Toy.find({ _id: { $in: ids } }).select(TOY_FIELDS).lean<ToyTarget[]>();

export const findUsersByIds = (ids: Types.ObjectId[]) =>
  ids.length === 0
    ? Promise.resolve([] as UserTarget[])
    : User.find({ _id: { $in: ids } }).select(USER_FIELDS).lean<UserTarget[]>();

export const findMessagesByIds = (ids: Types.ObjectId[]) =>
  ids.length === 0
    ? Promise.resolve([] as MessageTarget[])
    : Messages.find({ _id: { $in: ids } })
        .select('conversationId senderId content createdAt')
        .lean<MessageTarget[]>();

import { Types, type ClientSession } from 'mongoose';

import { AuditLog, type AuditDetails, type IAuditLog } from '../models/audit-log.model.js';
import { User } from '../models/user.model.js';
import type { AdminContext } from '../utils/admin-context.js';
import { escapeRegex } from '../utils/text.js';

/** Dotted action name: "<area>.<verb>", e.g. "toy.approve", "category.reorder". */
export type AuditAction = `${string}.${string}`;

/** What an audit row points to, stored in audit_logs.target_type. */
export const auditTargetTypes = [
  'CATEGORY',
  'ORGANIZATION',
  'TOY',
  'DONATION_REQUEST',
  'IDENTITY_VERIFICATION',
  'USER',
  'MESSAGE',
  'VIOLATION_REPORT',
  'WITHDRAWAL_REQUEST',
] as const;
export type AuditTargetType = (typeof auditTargetTypes)[number];

export type { AuditDetails };

export interface AuditEntry {
  actorId?: string;
  action: AuditAction;
  // `id` is left out only for collection-level actions (e.g. reordering all categories).
  target: { kind: AuditTargetType; id?: string };
  // A short summary (decision C1): a name, a reason, an old -> new value. No personal data.
  details?: AuditDetails;
  ipAddress?: string;
}

const MAX_DETAIL_KEYS = 10;
const MAX_DETAIL_TEXT = 300;

/** Keeps `details` short: at most 10 primitive values, texts cut to 300 characters. */
export const shortDetails = (details: AuditDetails | undefined): AuditDetails | undefined => {
  if (!details) return undefined;
  const entries = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .slice(0, MAX_DETAIL_KEYS)
    .map(([key, value]) => [
      key,
      typeof value === 'string' && value.length > MAX_DETAIL_TEXT
        ? `${value.slice(0, MAX_DETAIL_TEXT - 1)}…`
        : value,
    ]);
  return entries.length > 0 ? (Object.fromEntries(entries) as AuditDetails) : undefined;
};

/** The audit_logs document (R04 3.23: actor_id, action, target_type, target_id, details, ip_address). */
export const buildAuditLog = (entry: AuditEntry) => {
  const details = shortDetails(entry.details);
  return {
    ...(entry.actorId ? { actor_id: new Types.ObjectId(entry.actorId) } : {}),
    action: entry.action,
    target_type: entry.target.kind,
    ...(entry.target.id ? { target_id: new Types.ObjectId(entry.target.id) } : {}),
    ...(details ? { details } : {}),
    ...(entry.ipAddress ? { ip_address: entry.ipAddress } : {}),
  };
};

/**
 * The shared audit writer (UC31). Writes one row, inside the caller's transaction when a session
 * is given, so every row is a committed action. Rows are append-only (see the model).
 */
export const writeAuditLog = async (entry: AuditEntry, session?: ClientSession): Promise<void> => {
  await AuditLog.create([buildAuditLog(entry)], session ? { session } : {});
};

/** Same as writeAuditLog: the name used by modules that only record an action. */
export const recordAudit = writeAuditLog;

/** The audit entry of an Admin action: the acting Admin and their IP come from the context. */
export const adminAuditEntry = (
  context: AdminContext,
  action: AuditAction,
  target: AuditEntry['target'],
  details?: AuditDetails,
): AuditEntry => ({
  actorId: context.actor.actorId,
  action,
  target,
  ...(details ? { details } : {}),
  ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
});

// ---- Reading (Admin Audit Log screen) ----

export interface AuditLogFilter {
  actorId?: string | undefined;
  // An exact action ("toy.reject") or an area ("toy", every "toy.*" action).
  action?: string | undefined;
  targetType?: AuditTargetType | undefined;
  targetId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}


const toQuery = (filter: AuditLogFilter): Record<string, unknown> => {
  const query: Record<string, unknown> = {};
  if (filter.actorId) query.actor_id = new Types.ObjectId(filter.actorId);
  if (filter.action) {
    query.action = filter.action.includes('.')
      ? filter.action
      : { $regex: `^${escapeRegex(`${filter.action}.`)}` };
  }
  if (filter.targetType) query.target_type = filter.targetType;
  if (filter.targetId) query.target_id = new Types.ObjectId(filter.targetId);
  if (filter.from || filter.to) {
    query.created_at = {
      ...(filter.from ? { $gte: filter.from } : {}),
      ...(filter.to ? { $lte: filter.to } : {}),
    };
  }
  return query;
};

export type AuditLogRecord = IAuditLog;

export const findAuditLogs = (
  filter: AuditLogFilter,
  paging: { skip: number; limit: number; sort: Record<string, 1 | -1> },
) =>
  AuditLog.find(toQuery(filter))
    .sort(paging.sort)
    .skip(paging.skip)
    .limit(paging.limit)
    .lean<AuditLogRecord[]>();

export const countAuditLogs = (filter: AuditLogFilter) =>
  AuditLog.countDocuments(toQuery(filter));

export const findActorNames = async (ids: Types.ObjectId[]) => {
  if (ids.length === 0) return new Map<string, string>();
  const users = await User.find({ _id: { $in: ids } })
    .select('fullName')
    .lean<Array<{ _id: Types.ObjectId; fullName: string }>>();
  return new Map(users.map((user) => [String(user._id), user.fullName]));
};

/** Every action name written so far, for the filter list. */
export const findDistinctActions = async (): Promise<string[]> =>
  ((await AuditLog.distinct('action')) as string[]).sort();

/** Admin accounts (the actors of Admin actions), for the filter list. */
export const findAdminActors = () =>
  User.find({ role: 'ADMIN' })
    .select('fullName')
    .sort({ fullName: 1 })
    .lean<Array<{ _id: Types.ObjectId; fullName: string }>>();

import { Types, type ClientSession } from 'mongoose';

import { AuditLog } from '../models/audit-log.model.js';
import type { AdminContext } from '../utils/admin-context.js';

/** Dotted action name: "<area>.<verb>", e.g. "toy.approve", "category.reorder". */
export type AuditAction = `${string}.${string}`;

/** What an audit row points to, stored in audit_logs.target_type. */
export type AuditTargetType =
  | 'CATEGORY'
  | 'ORGANIZATION'
  | 'TOY'
  | 'DONATION_REQUEST'
  | 'IDENTITY_VERIFICATION'
  | 'USER';

export interface AuditEntry {
  actorId?: string;
  action: AuditAction;
  // `id` is left out only for collection-level actions (e.g. reordering all categories).
  target: { kind: AuditTargetType; id?: string };
  ipAddress?: string;
}

/** The audit_logs document (develop's schema: actor_id, action, target_type, target_id, ip_address). */
export const buildAuditLog = (entry: AuditEntry) => ({
  ...(entry.actorId ? { actor_id: new Types.ObjectId(entry.actorId) } : {}),
  action: entry.action,
  target_type: entry.target.kind,
  ...(entry.target.id ? { target_id: new Types.ObjectId(entry.target.id) } : {}),
  ...(entry.ipAddress ? { ip_address: entry.ipAddress } : {}),
});

/** Writes one audit row, inside the caller's transaction when a session is given. */
export const writeAuditLog = async (entry: AuditEntry, session?: ClientSession): Promise<void> => {
  await AuditLog.create([buildAuditLog(entry)], session ? { session } : {});
};

/** The audit entry of an Admin action: the acting Admin and their IP come from the context. */
export const adminAuditEntry = (
  context: AdminContext,
  action: AuditAction,
  target: AuditEntry['target'],
): AuditEntry => ({
  actorId: context.actor.actorId,
  action,
  target,
  ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
});

import { Types, type ClientSession } from 'mongoose';

import { AuditLogModel } from '../../features/audit_logs/audit_logs.model.js';

import type { ActorType } from '../../shared/contracts/actor.js';
import type { ReferenceKind } from '../../shared/domain/enums.js';
import type { AdminContext } from '../../shared/http/admin-context.js';

/** Dotted action name: "<area>.<verb>", e.g. "toy.approve", "category.reorder". */
export type AuditAction = `${string}.${string}`;

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string;
  action: AuditAction;
  // `id` is left out only for collection-level actions (e.g. reordering all categories).
  target: { kind: ReferenceKind; id?: string };
  // Small before/after values or other context, e.g. { before: { status }, after: { status } }.
  meta?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * The audit_logs document for an Admin or system action (UC31, R03 IV.2.3). A repository writes
 * it in the same transaction as the change it records, through writeAuditLog(entry, session).
 */
export const buildAuditLog = (entry: AuditEntry) => ({
  actorType: entry.actorType,
  ...(entry.actorId ? { actorId: new Types.ObjectId(entry.actorId) } : {}),
  action: entry.action,
  target: {
    kind: entry.target.kind,
    ...(entry.target.id ? { id: new Types.ObjectId(entry.target.id) } : {}),
  },
  ...(entry.meta ? { meta: entry.meta } : {}),
  ...(entry.ipAddress ? { ipAddress: entry.ipAddress } : {}),
});

/** Writes one audit row, inside the caller's transaction when a session is given. */
export const writeAuditLog = async (entry: AuditEntry, session?: ClientSession): Promise<void> => {
  await AuditLogModel.create([buildAuditLog(entry)], session ? { session } : {});
};

/** The audit entry of an Admin action: the acting Admin and their IP come from the context. */
export const adminAuditEntry = (
  context: AdminContext,
  action: AuditAction,
  target: AuditEntry['target'],
  meta?: Record<string, unknown>,
): AuditEntry => ({
  ...context.actor,
  action,
  target,
  ...(meta ? { meta } : {}),
  ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
});

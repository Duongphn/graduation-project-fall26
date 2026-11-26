import { Types } from 'mongoose';

import * as repository from '../repositories/audit-log.repository.js';
import { toMongoPaging } from '../utils/response.js';
import {
  type AuditLogFilters,
  type AuditLogItem,
  type AuditLogQuery,
} from '../validations/audit-log.validation.js';

// Admin Audit Log (UC31): who did which important action and when. Read-only.

const toItem = (
  row: repository.AuditLogRecord,
  actorNames: Map<string, string>,
): AuditLogItem => ({
  id: String(row._id),
  action: row.action,
  actor: row.actor_id
    ? { id: String(row.actor_id), fullName: actorNames.get(String(row.actor_id)) ?? null }
    : null,
  targetType: row.target_type as AuditLogItem['targetType'],
  targetId: row.target_id ? String(row.target_id) : null,
  details: row.details ?? null,
  ipAddress: row.ip_address ?? null,
  createdAt: row.created_at.toISOString(),
});

/** Newest first by default; sortOrder=asc lists the oldest first. */
export const listAuditLogs = async (
  query: AuditLogQuery,
): Promise<{ items: AuditLogItem[]; totalItems: number }> => {
  const filter: repository.AuditLogFilter = {
    actorId: query.actorId,
    action: query.action,
    targetType: query.targetType,
    targetId: query.targetId,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  };
  const { skip, limit } = toMongoPaging(query, []);
  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const [rows, totalItems] = await Promise.all([
    repository.findAuditLogs(filter, { skip, limit, sort: { created_at: direction, _id: direction } }),
    repository.countAuditLogs(filter),
  ]);
  const actorIds = [
    ...new Map(
      rows.filter((row) => row.actor_id).map((row) => [String(row.actor_id), row.actor_id!]),
    ).values(),
  ] as Types.ObjectId[];
  const actorNames = await repository.findActorNames(actorIds);
  return { items: rows.map((row) => toItem(row, actorNames)), totalItems };
};

/** Values for the filter lists: the actions written so far and the Admin accounts. */
export const getFilterOptions = async (): Promise<AuditLogFilters> => {
  const [actions, admins] = await Promise.all([
    repository.findDistinctActions(),
    repository.findAdminActors(),
  ]);
  return {
    actions,
    actors: admins.map((admin) => ({ id: String(admin._id), fullName: admin.fullName })),
  };
};

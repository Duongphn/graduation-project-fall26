import type { PaginationParams } from '../../types/api'

// Responses of /admin/audit-logs (server/src/validations/audit-log.validation.ts).

export type AuditTargetType =
  | 'CATEGORY'
  | 'ORGANIZATION'
  | 'TOY'
  | 'DONATION_REQUEST'
  | 'IDENTITY_VERIFICATION'
  | 'USER'
  | 'VIOLATION_REPORT'
  | 'WITHDRAWAL_REQUEST'
  | 'MESSAGE'

export interface AuditLogItem {
  id: string
  action: string
  // Null for an action of a system job.
  actor: { id: string; fullName: string | null } | null
  targetType: AuditTargetType
  targetId: string | null
  // Short summary: a name, a reason, an old -> new value.
  details: Record<string, string | number | boolean | null> | null
  ipAddress: string | null
  createdAt: string
}

export interface AuditLogFilterOptions {
  actions: string[]
  actors: Array<{ id: string; fullName: string }>
}

export interface AuditLogFilters {
  actorId?: string
  // Exact action ("toy.reject") or an area ("toy").
  action?: string
  from?: string
  to?: string
}

export interface AuditLogParams extends PaginationParams, AuditLogFilters {}

import { apiGet, apiGetPage } from '../../services/http'
import type { AuditLogFilterOptions, AuditLogItem, AuditLogParams } from './types'

const BASE = '/admin/audit-logs'

// Admin audit log (UC31). Read-only: the backend has no endpoint that changes an entry.
export const auditLogsApi = {
  list: (params: AuditLogParams) => apiGetPage<AuditLogItem>(BASE, params),

  filters: () => apiGet<AuditLogFilterOptions>(`${BASE}/filters`),
}

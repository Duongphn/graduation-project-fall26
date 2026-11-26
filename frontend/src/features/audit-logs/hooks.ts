import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { auditLogsApi } from './api'
import type { AuditLogParams } from './types'

export const auditLogKeys = {
  all: ['audit-logs'] as const,
  list: (params: AuditLogParams) => [...auditLogKeys.all, 'list', params] as const,
  filters: () => [...auditLogKeys.all, 'filters'] as const,
}

export const useAuditLogs = (params: AuditLogParams) =>
  useQuery({
    queryKey: auditLogKeys.list(params),
    queryFn: () => auditLogsApi.list(params),
    placeholderData: keepPreviousData,
  })

export const useAuditLogFilterOptions = () =>
  useQuery({ queryKey: auditLogKeys.filters(), queryFn: auditLogsApi.filters, staleTime: 60_000 })

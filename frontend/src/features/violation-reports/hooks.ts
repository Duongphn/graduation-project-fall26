import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import { accountKeys } from '../accounts/hooks'
import { auditLogKeys } from '../audit-logs/hooks'
import { violationReportsApi } from './api'
import type { ReportFilters, ReportListParams, ResolveReportInput } from './types'

export const reportKeys = {
  all: ['violation-reports'] as const,
  list: (params: ReportListParams) => [...reportKeys.all, 'list', params] as const,
  counts: (filters: ReportFilters) => [...reportKeys.all, 'counts', filters] as const,
  detail: (id: string) => [...reportKeys.all, 'detail', id] as const,
}

export const useReports = (params: ReportListParams) =>
  useQuery({
    queryKey: reportKeys.list(params),
    queryFn: () => violationReportsApi.list(params),
    placeholderData: keepPreviousData,
  })

export const useReportCounts = (filters: ReportFilters) =>
  useQuery({
    queryKey: reportKeys.counts(filters),
    queryFn: () => violationReportsApi.counts(filters),
    placeholderData: keepPreviousData,
  })

export const useReport = (id: string | undefined) =>
  useQuery({
    queryKey: reportKeys.detail(id ?? ''),
    queryFn: () => violationReportsApi.detail(id ?? ''),
    enabled: Boolean(id),
  })

export const useResolveReport = ({ onSuccess }: { onSuccess?: () => void } = {}) =>
  useApiMutation({
    mutationFn: ({ id, input }: { id: string; input: ResolveReportInput }) =>
      violationReportsApi.resolve(id, input),
    successMessage: (result) =>
      result.status === 'dismissed' ? 'Đã bỏ qua báo cáo.' : 'Đã xử lý báo cáo.',
    invalidate: [reportKeys.all, accountKeys.all, auditLogKeys.all],
    invalidateOnConflict: true,
    ...(onSuccess ? { onSuccess } : {}),
  })

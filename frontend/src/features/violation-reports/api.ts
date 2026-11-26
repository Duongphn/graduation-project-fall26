import { apiGet, apiGetPage, apiPost } from '../../services/http'
import type {
  CreateReportInput,
  ReportDetail,
  ReportFilters,
  ReportListItem,
  ReportListParams,
  ReportStatusCounts,
  ResolveReportInput,
  ResolveReportResult,
} from './types'

const ADMIN_BASE = '/admin/violation-reports'

export const violationReportsApi = {
  // UC28, for the user report form: 409 REPORT_ALREADY_PENDING, 429 REPORT_RATE_LIMITED.
  create: (input: CreateReportInput) =>
    apiPost<{ id: string; status: 'pending' }>('/violation-reports', input),

  // UC29: pending reports come unsafe first, then the oldest first.
  list: (params: ReportListParams) => apiGetPage<ReportListItem>(ADMIN_BASE, params),

  counts: (filters: ReportFilters) => apiGet<ReportStatusCounts>(`${ADMIN_BASE}/counts`, filters),

  detail: (id: string) => apiGet<ReportDetail>(`${ADMIN_BASE}/${id}`),

  resolve: (id: string, input: ResolveReportInput) =>
    apiPost<ResolveReportResult>(`${ADMIN_BASE}/${id}/resolve`, input),
}

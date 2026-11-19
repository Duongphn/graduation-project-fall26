import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import { disputeResolutionApi } from './api'
import type { AdminDisputeListParams, ResolveDisputeInput } from './types'

export const disputeResolutionKeys = {
  all: ['admin-disputes'] as const,
  list: (params: AdminDisputeListParams) => [...disputeResolutionKeys.all, 'list', params] as const,
  detail: (id: string) => [...disputeResolutionKeys.all, 'detail', id] as const,
}

export const useAdminDisputes = (params: AdminDisputeListParams) =>
  useQuery({
    queryKey: disputeResolutionKeys.list(params),
    queryFn: () => disputeResolutionApi.list(params),
    placeholderData: keepPreviousData,
  })

export const useAdminDisputeCase = (id: string) =>
  useQuery({
    queryKey: disputeResolutionKeys.detail(id),
    queryFn: () => disputeResolutionApi.caseFile(id),
    enabled: Boolean(id),
  })

// After a verdict (or a 409 because another Admin decided first) the case file and the queue are
// refetched in place, so the page shows the verdict that stands.
export const useResolveDispute = (id: string) =>
  useApiMutation({
    mutationFn: (input: ResolveDisputeInput) => disputeResolutionApi.resolve(id, input),
    successMessage: 'Đã ban hành phán quyết. Tiền ký quỹ đã được chia và đơn chuyển sang Hoàn tất.',
    invalidate: [disputeResolutionKeys.all],
    invalidateOnConflict: true,
  })

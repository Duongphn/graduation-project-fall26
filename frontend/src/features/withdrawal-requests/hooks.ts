import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import { auditLogKeys } from '../audit-logs/hooks'
import { withdrawalRequestsApi } from './api'
import type { AdminWithdrawalListParams, ProcessWithdrawalInput } from './types'

export const withdrawalKeys = {
  all: ['admin-withdrawals'] as const,
  list: (params: AdminWithdrawalListParams) => [...withdrawalKeys.all, 'list', params] as const,
  counts: () => [...withdrawalKeys.all, 'counts'] as const,
}

export const useWithdrawals = (params: AdminWithdrawalListParams) =>
  useQuery({
    queryKey: withdrawalKeys.list(params),
    queryFn: () => withdrawalRequestsApi.list(params),
    placeholderData: keepPreviousData,
  })

// Also feeds the admin menu badge (useAdminPendingCounts).
export const useWithdrawalCounts = () =>
  useQuery({
    queryKey: withdrawalKeys.counts(),
    queryFn: () => withdrawalRequestsApi.counts(),
    placeholderData: keepPreviousData,
  })

export const useProcessWithdrawal = ({ onSuccess }: { onSuccess?: () => void } = {}) =>
  useApiMutation({
    mutationFn: ({ id, input }: { id: string; input: ProcessWithdrawalInput }) =>
      withdrawalRequestsApi.process(id, input),
    successMessage: (result) =>
      result.status === 'rejected'
        ? 'Đã từ chối lệnh rút và hoàn tiền vào ví người dùng.'
        : 'Đã ghi nhận chuyển khoản cho người dùng.',
    invalidate: [withdrawalKeys.all, auditLogKeys.all],
    invalidateOnConflict: true,
    ...(onSuccess ? { onSuccess } : {}),
  })

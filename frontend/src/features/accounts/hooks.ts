import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import { auditLogKeys } from '../audit-logs/hooks'
import { accountsApi } from './api'
import type { AccountAction, AccountFilters, AccountListParams } from './types'

export const accountKeys = {
  all: ['accounts'] as const,
  list: (params: AccountListParams) => [...accountKeys.all, 'list', params] as const,
  counts: (filters: AccountFilters) => [...accountKeys.all, 'counts', filters] as const,
  detail: (id: string) => [...accountKeys.all, 'detail', id] as const,
}

export const useAccounts = (params: AccountListParams) =>
  useQuery({
    queryKey: accountKeys.list(params),
    queryFn: () => accountsApi.list(params),
    placeholderData: keepPreviousData,
  })

export const useAccountCounts = (filters: AccountFilters) =>
  useQuery({
    queryKey: accountKeys.counts(filters),
    queryFn: () => accountsApi.counts(filters),
    placeholderData: keepPreviousData,
  })

export const useAccount = (id: string | undefined) =>
  useQuery({
    queryKey: accountKeys.detail(id ?? ''),
    queryFn: () => accountsApi.detail(id ?? ''),
    enabled: Boolean(id),
  })

// One mutation for the four choices of the enforcement form (R03 III.7.2.1 (8)).
export const useAccountAction = ({ onSuccess }: { onSuccess?: () => void } = {}) =>
  useApiMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: AccountAction; reason: string }) =>
      action === 'unlock' ? accountsApi.unlock(id, reason) : accountsApi.lock(id, action, reason),
    successMessage: (_data, { action }) =>
      action === 'unlock' ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.',
    invalidate: [accountKeys.all, auditLogKeys.all],
    invalidateOnConflict: true,
    ...(onSuccess ? { onSuccess } : {}),
  })

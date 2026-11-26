import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import { rentalKeys } from '../rentals/rental-orders-api'
import { disputesApi } from './api'
import type { DisputeListParams, ResolveDisputeInput } from './types'

export const disputeKeys = {
  all: ['disputes'] as const,
  list: (params: DisputeListParams) => [...disputeKeys.all, 'list', params] as const,
  detail: (id: string) => [...disputeKeys.all, 'detail', id] as const,
}

export const useDisputes = (params: DisputeListParams) =>
  useQuery({
    queryKey: disputeKeys.list(params),
    queryFn: () => disputesApi.list(params),
    placeholderData: keepPreviousData,
  })

export const useDispute = (id: string) =>
  useQuery({
    queryKey: disputeKeys.detail(id),
    queryFn: () => disputesApi.detail(id),
    enabled: Boolean(id),
  })

// After a 409 (another Admin decided first, or the reply window is still open) the case is
// refetched and the backend message is shown.
export const useResolveDispute = (id: string, onSuccess?: () => void) =>
  useApiMutation({
    mutationFn: (input: ResolveDisputeInput) => disputesApi.resolve(id, input),
    successMessage: 'Đã ra phán quyết và quyết toán đơn thuê.',
    invalidate: [disputeKeys.all, rentalKeys.all],
    invalidateOnConflict: true,
    ...(onSuccess ? { onSuccess } : {}),
  })

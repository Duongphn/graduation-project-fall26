import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import { toyModerationApi } from './api'
import type { ToyModerationFilters, ToyModerationQueueParams } from './types'

export const toyModerationKeys = {
  all: ['toy-moderation'] as const,
  queue: (params: ToyModerationQueueParams) => [...toyModerationKeys.all, 'queue', params] as const,
  counts: (filters: ToyModerationFilters) => [...toyModerationKeys.all, 'counts', filters] as const,
  detail: (id: string) => [...toyModerationKeys.all, 'detail', id] as const,
}

export const useToyModerationQueue = (params: ToyModerationQueueParams) =>
  useQuery({
    queryKey: toyModerationKeys.queue(params),
    queryFn: () => toyModerationApi.queue(params),
    placeholderData: keepPreviousData,
  })

export const useToyStatusCounts = (filters: ToyModerationFilters) =>
  useQuery({
    queryKey: toyModerationKeys.counts(filters),
    queryFn: () => toyModerationApi.counts(filters),
    placeholderData: keepPreviousData,
  })

export const useToyModerationDetail = (id: string) =>
  useQuery({
    queryKey: toyModerationKeys.detail(id),
    queryFn: () => toyModerationApi.detail(id),
    enabled: Boolean(id),
  })

interface DecisionCallbacks {
  onSuccess?: () => void
}

// A 409 means the post changed or another Admin decided first: the detail, queue and counts are
// refetched in place (invalidateOnConflict) and the backend message is shown.
export const useApproveToy = ({ onSuccess }: DecisionCallbacks = {}) =>
  useApiMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      toyModerationApi.approve(id, expectedUpdatedAt),
    successMessage: 'Đã duyệt tin đăng.',
    invalidate: [toyModerationKeys.all],
    invalidateOnConflict: true,
    onSuccess,
  })

export const useRejectToy = ({ onSuccess }: DecisionCallbacks = {}) =>
  useApiMutation({
    mutationFn: ({
      id,
      expectedUpdatedAt,
      reason,
    }: {
      id: string
      expectedUpdatedAt: string
      reason: string
    }) => toyModerationApi.reject(id, expectedUpdatedAt, reason),
    successMessage: 'Đã từ chối tin đăng.',
    invalidate: [toyModerationKeys.all],
    invalidateOnConflict: true,
    onSuccess,
  })

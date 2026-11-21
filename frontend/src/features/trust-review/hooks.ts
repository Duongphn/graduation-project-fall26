import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import { trustReviewApi } from './api'
import type { TrustDecisionInput, TrustQueueParams } from './types'

export const trustReviewKeys = {
  all: ['admin-trust-reviews'] as const,
  list: (params: TrustQueueParams) => [...trustReviewKeys.all, 'list', params] as const,
  detail: (userId: string) => [...trustReviewKeys.all, 'detail', userId] as const,
}

export const useTrustQueue = (params: TrustQueueParams) =>
  useQuery({
    queryKey: trustReviewKeys.list(params),
    queryFn: () => trustReviewApi.list(params),
    placeholderData: keepPreviousData,
  })

export const useTrustReviewDetail = (userId: string) =>
  useQuery({
    queryKey: trustReviewKeys.detail(userId),
    queryFn: () => trustReviewApi.detail(userId),
    enabled: Boolean(userId),
  })

// Both decisions take the user out of the queue. After a 409 TRUST_REVIEW_NOT_PENDING (another Admin decided first) the
// detail and queue are refetched so the page shows the decision that stands.
export const useTrustDecision = (userId: string, onDone?: () => void) =>
  useApiMutation({
    mutationFn: (input: TrustDecisionInput) => trustReviewApi.decide(userId, input),
    successMessage: (_, input) =>
      input.decision === 'ALLOW'
        ? 'Đã cho phép. Người dùng được đặt thuê đồ cọc cao trong thời gian ân hạn và đã được báo.'
        : 'Đã giữ hạn chế. Người dùng đã được báo lý do.',
    invalidate: [trustReviewKeys.all],
    refetchOnStale: true,
    onSuccess: onDone,
  })

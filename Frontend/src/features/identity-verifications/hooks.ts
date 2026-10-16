import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Query } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import { identityVerificationsApi } from './api'
import type { IdentityQueueParams, IdentityVerificationDetail } from './types'

export const identityVerificationKeys = {
  all: ['identity-verifications'] as const,
  list: (params: IdentityQueueParams) => [...identityVerificationKeys.all, 'list', params] as const,
  counts: () => [...identityVerificationKeys.all, 'counts'] as const,
  detail: (id: string) => [...identityVerificationKeys.all, 'detail', id] as const,
}

export const useIdentityQueue = (params: IdentityQueueParams) =>
  useQuery({
    queryKey: identityVerificationKeys.list(params),
    queryFn: () => identityVerificationsApi.list(params),
    placeholderData: keepPreviousData,
  })

export const useIdentityCounts = () =>
  useQuery({ queryKey: identityVerificationKeys.counts(), queryFn: identityVerificationsApi.counts })

// Every detail fetch makes the server sign new links and write an audit entry, so refetch only
// while the request is PENDING, only in the foreground, and just before the links expire.
const LINK_REFRESH_MARGIN_MS = 60_000
const MIN_REFRESH_MS = 30_000

const msUntilLinkRefresh = (detail: IdentityVerificationDetail | undefined): number | null => {
  if (detail?.status !== 'PENDING' || !detail.previewExpiresAt) return null
  return new Date(detail.previewExpiresAt).getTime() - LINK_REFRESH_MARGIN_MS - Date.now()
}

type DetailQuery = Query<IdentityVerificationDetail, Error, IdentityVerificationDetail, readonly unknown[]>

export const useIdentityVerification = (id: string | undefined) =>
  useQuery({
    queryKey: identityVerificationKeys.detail(id ?? ''),
    queryFn: () => identityVerificationsApi.detail(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: (query: DetailQuery) => {
      const wait = msUntilLinkRefresh(query.state.data)
      return wait === null ? false : Math.max(wait, MIN_REFRESH_MS)
    },
    refetchIntervalInBackground: false,
    // Back from another tab: refetch only when the links are (nearly) expired.
    refetchOnWindowFocus: (query: DetailQuery) => {
      const wait = msUntilLinkRefresh(query.state.data)
      return wait !== null && wait <= 0
    },
  })

interface DecisionCallbacks {
  onSuccess: () => void
  onError?: (error: unknown) => void
}

// After a 409 (another Admin decided first) the queue, counts and detail are refetched
// (invalidateOnConflict) and useApiMutation still shows the backend message.
export const useApproveIdentity = ({ onSuccess, onError }: DecisionCallbacks) =>
  useApiMutation({
    mutationFn: (id: string) => identityVerificationsApi.approve(id),
    successMessage: 'Đã xác minh danh tính người dùng.',
    invalidate: [identityVerificationKeys.all],
    invalidateOnConflict: true,
    onSuccess,
    onError: (error) => {
      onError?.(error)
      return false
    },
  })

export const useRejectIdentity = ({ onSuccess, onError }: DecisionCallbacks) =>
  useApiMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      identityVerificationsApi.reject(id, reason),
    successMessage: 'Đã từ chối yêu cầu xác minh danh tính.',
    invalidate: [identityVerificationKeys.all],
    invalidateOnConflict: true,
    onSuccess,
    onError: (error) => {
      onError?.(error)
      return false
    },
  })

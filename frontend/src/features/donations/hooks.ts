import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import { donationRequestsApi } from './api'
import type { ConfirmReceivedInput, DonationCountParams, DonationListParams } from './types'

export const donationKeys = {
  all: ['donation-requests'] as const,
  list: (params: DonationListParams) => [...donationKeys.all, 'list', params] as const,
  counts: (params: DonationCountParams) => [...donationKeys.all, 'counts', params] as const,
  detail: (id: string) => [...donationKeys.all, 'detail', id] as const,
}

export const useDonationRequests = (params: DonationListParams) =>
  useQuery({
    queryKey: donationKeys.list(params),
    queryFn: () => donationRequestsApi.list(params),
    placeholderData: keepPreviousData,
  })

export const useDonationCounts = (params: DonationCountParams) =>
  useQuery({
    queryKey: donationKeys.counts(params),
    queryFn: () => donationRequestsApi.counts(params),
    placeholderData: keepPreviousData,
  })

export const useDonationRequest = (id: string) =>
  useQuery({
    queryKey: donationKeys.detail(id),
    queryFn: () => donationRequestsApi.detail(id),
    enabled: Boolean(id),
  })

// Every action refetches lists, counts and the detail (siblings may change on accept), also
// after a 409 when someone else changed the request first.
const invalidate = [donationKeys.all]

export const useDonationActions = (id: string) => ({
  accept: useApiMutation({
    mutationFn: () => donationRequestsApi.accept(id),
    successMessage: 'Đã chấp nhận yêu cầu; các yêu cầu khác cho đồ chơi này đã bị từ chối.',
    invalidate,
    invalidateOnConflict: true,
  }),
  reject: useApiMutation({
    mutationFn: (reason: string) => donationRequestsApi.reject(id, reason),
    successMessage: 'Đã từ chối yêu cầu.',
    invalidate,
    invalidateOnConflict: true,
  }),
  cancel: useApiMutation({
    mutationFn: (reason: string) => donationRequestsApi.cancel(id, reason),
    successMessage: 'Đã huỷ yêu cầu.',
    invalidate,
    invalidateOnConflict: true,
  }),
  confirmReceived: useApiMutation({
    mutationFn: (input: ConfirmReceivedInput) => donationRequestsApi.confirmReceived(id, input),
    successMessage: 'Đã xác nhận bên nhận đã nhận đồ chơi.',
    invalidate,
    invalidateOnConflict: true,
  }),
})

import { queryOptions } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import { ApiError } from '../../services/api-error'
import { donorDonationsApi } from './donor-api'
import { MY_DONATIONS_PAGE_SIZE, myDonationKeys, type MyDonationFilters } from './donor-queries'
import { receiverDonationsApi, type CreateDonationRequestInput } from './receiver-api'
import type { HandoverInput } from './types'

export const myRequestKeys = {
  all: ['my-donation-requests'] as const,
  list: (filters: MyDonationFilters) => [...myRequestKeys.all, 'list', filters] as const,
  detail: (id: string) => [...myRequestKeys.all, 'detail', id] as const,
}

/** Yêu cầu nhận đồ của tôi (GET /donation-requests/mine), cập nhật gần nhất trước */
export const myRequestsQuery = (filters: MyDonationFilters) =>
  queryOptions({
    queryKey: myRequestKeys.list(filters),
    queryFn: () =>
      receiverDonationsApi.mine({
        status: filters.status,
        page: filters.page,
        limit: MY_DONATIONS_PAGE_SIZE,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
    staleTime: 30_000,
    retry: false,
  })

export const myRequestQuery = (id: string) =>
  queryOptions({
    queryKey: myRequestKeys.detail(id),
    queryFn: () => donorDonationsApi.detail(id),
    staleTime: 30_000,
    retry: false,
  })

/** Thông báo tiếng Việt cho lỗi khi gửi yêu cầu nhận đồ (POST /donation-requests) */
export function createRequestErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Đã có lỗi xảy ra. Vui lòng thử lại.'
  switch (error.code) {
    case 'TOY_NOT_AVAILABLE':
      return 'Đồ chơi này đã có người nhận hoặc không còn được tặng.'
    case 'DONATION_REQUEST_EXISTS':
      return 'Bạn đã gửi yêu cầu nhận đồ chơi này rồi, hãy chờ người tặng phản hồi.'
    case 'OWN_TOY':
      return 'Bạn không thể xin nhận đồ chơi do chính mình đăng tặng.'
    case 'DONOR_LOCKED':
      return 'Người tặng đang tạm khoá, chưa thể nhận yêu cầu.'
    case 'TOY_NOT_FOUND':
      return 'Đồ chơi không còn trên ToyFlow.'
  }
  if (error.status === 403) return 'Tài khoản của bạn chưa được phép gửi yêu cầu. Hãy xác minh danh tính trước.'
  return error.message
}

const invalidate = [myRequestKeys.all, myDonationKeys.all]

export const useMyRequestActions = (id: string) => ({
  cancel: useApiMutation({
    mutationFn: (note?: string) => donorDonationsApi.cancel(id, note),
    successMessage: 'Đã huỷ yêu cầu nhận đồ.',
    invalidate,
    invalidateOnConflict: true,
  }),
  confirmReceived: useApiMutation({
    mutationFn: (input: HandoverInput) => receiverDonationsApi.confirmReceived(id, input),
    successMessage: 'Đã xác nhận nhận đồ chơi. Cảm ơn bạn!',
    invalidate,
    invalidateOnConflict: true,
  }),
})

interface CreateRequestCallbacks {
  onCreated: (requestId: string) => void
  // Vietnamese message shown inside the card (409/422/403…)
  onFailed: (message: string) => void
  // 401: the session ended, the card sends the user to the login page
  onUnauthorized: () => void
}

export const useCreateDonationRequest = ({ onCreated, onFailed, onUnauthorized }: CreateRequestCallbacks) =>
  useApiMutation({
    mutationFn: (input: CreateDonationRequestInput) => receiverDonationsApi.create(input),
    successMessage: 'Đã gửi yêu cầu nhận đồ chơi. Người tặng sẽ phản hồi sớm.',
    invalidate: [myRequestKeys.all],
    onSuccess: (data) => onCreated(data.id),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) onUnauthorized()
      else onFailed(createRequestErrorMessage(error))
      return true
    },
  })

import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import { donationStatuses, type DonationStatus } from '../../constants/domain'
import { useApiMutation } from '../../hooks/useApiMutation'
import { donorDonationsApi } from './donor-api'
import type { HandoverInput } from './types'

export const MY_DONATIONS_PAGE_SIZE = 10

export interface MyDonationFilters {
  status?: DonationStatus
  page: number
}

const isDonationStatus = (value: string | null): value is DonationStatus =>
  donationStatuses.includes(value as DonationStatus)

/** Bộ lọc trên URL: ?status=shipping&page=2 — giá trị lạ bị bỏ qua */
export function parseMyDonationsSearch(searchParams: URLSearchParams): MyDonationFilters {
  const status = searchParams.get('status')
  const page = Number(searchParams.get('page'))
  return {
    status: isDonationStatus(status) ? status : undefined,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

export function toMyDonationsSearch({ status, page }: MyDonationFilters) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (page > 1) params.set('page', String(page))
  return params
}

export const myDonationKeys = {
  all: ['my-donations'] as const,
  list: (filters: MyDonationFilters) => [...myDonationKeys.all, 'list', filters] as const,
  detail: (id: string) => [...myDonationKeys.all, 'detail', id] as const,
}

/** Dùng chung cho loader (tải trước) và useQuery trong trang */
export const myDonationsQuery = (filters: MyDonationFilters) =>
  queryOptions({
    queryKey: myDonationKeys.list(filters),
    queryFn: () =>
      donorDonationsApi.incoming({
        status: filters.status,
        page: filters.page,
        limit: MY_DONATIONS_PAGE_SIZE,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
    staleTime: 30_000,
    retry: false,
  })

export const donationSummaryQuery = (userId: string) =>
  queryOptions({
    queryKey: [...myDonationKeys.all, 'summary', userId],
    queryFn: () => donorDonationsApi.summary(userId),
    staleTime: 60_000,
    retry: false,
  })

/** Lịch sử đã trao tặng (COMPLETED), mới hoàn tất trước, tải thêm từng trang */
export const completedDonationsQuery = infiniteQueryOptions({
  queryKey: [...myDonationKeys.all, 'completed'],
  queryFn: ({ pageParam }) =>
    donorDonationsApi.incoming({
      status: 'completed',
      page: pageParam,
      limit: MY_DONATIONS_PAGE_SIZE,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    }),
  initialPageParam: 1,
  getNextPageParam: (last) => (last.pagination.hasNextPage ? last.pagination.page + 1 : undefined),
  staleTime: 30_000,
  retry: false,
})

export const myDonationQuery = (id: string) =>
  queryOptions({
    queryKey: myDonationKeys.detail(id),
    queryFn: () => donorDonationsApi.detail(id),
    staleTime: 30_000,
    retry: false,
  })

// Sau mỗi thao tác tải lại cả danh sách và chi tiết; 409 (bên kia vừa đổi trạng thái) cũng tải lại
const invalidate = [myDonationKeys.all]

export const useMyDonationActions = (id: string) => ({
  accept: useApiMutation({
    mutationFn: () => donorDonationsApi.accept(id),
    successMessage: 'Đã đồng ý tặng. Hãy đóng gói và gửi đồ chơi cho bên nhận.',
    invalidate,
    invalidateOnConflict: true,
  }),
  reject: useApiMutation({
    mutationFn: (reason: string) => donorDonationsApi.reject(id, reason),
    successMessage: 'Đã từ chối yêu cầu nhận.',
    invalidate,
    invalidateOnConflict: true,
  }),
  handOver: useApiMutation({
    mutationFn: (input: HandoverInput) => donorDonationsApi.handOver(id, input),
    successMessage: 'Đã xác nhận gửi hàng. Bên nhận sẽ được thông báo.',
    invalidate,
    invalidateOnConflict: true,
  }),
  cancel: useApiMutation({
    mutationFn: (note?: string) => donorDonationsApi.cancel(id, note),
    successMessage: 'Đã huỷ phiếu quyên góp.',
    invalidate,
    invalidateOnConflict: true,
  }),
})

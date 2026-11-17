import { queryOptions } from '@tanstack/react-query'
import { fetchCategories, fetchMyListing, fetchMyListings, type ListingStatus } from './toy-listing-api'

/** Cùng một khai báo cho loader (tải trước) và useQuery trong trang (đọc cache) để không gọi API hai lần */

export const MY_LISTINGS_PAGE_SIZE = 5

/** Gốc chung để vô hiệu hoá mọi dữ liệu "tin của tôi" sau khi ẩn/xoá/sửa */
export const MY_LISTINGS_ROOT_KEY = ['my-listings'] as const

export const categoriesQuery = queryOptions({
  queryKey: ['categories'],
  queryFn: fetchCategories,
  staleTime: 5 * 60_000,
})

export const myListingQuery = (toyId: string) =>
  queryOptions({
    queryKey: ['my-listing', toyId],
    queryFn: () => fetchMyListing(toyId),
    staleTime: 30_000,
    retry: false,
  })

export const myListingsQuery = (params: { status?: ListingStatus; page: number }) =>
  queryOptions({
    queryKey: [...MY_LISTINGS_ROOT_KEY, 'page', params.status ?? 'all', params.page],
    queryFn: () => fetchMyListings({ ...params, limit: MY_LISTINGS_PAGE_SIZE }),
    staleTime: 30_000,
    retry: false,
    // Loader đã gọi API; lỗi (401/403...) không gọi lại khi trang mount, dùng nút "Thử lại"
    retryOnMount: false,
  })

export type ListingCounts = Record<ListingStatus | 'all', number>

const COUNTED_STATUSES: (ListingStatus | undefined)[] = [undefined, 'active', 'pending', 'sold', 'hidden']

/** Backend chưa có API thống kê: lấy `total` của từng bộ lọc trạng thái (limit=1 cho nhẹ) */
export const listingCountsQuery = queryOptions({
  queryKey: [...MY_LISTINGS_ROOT_KEY, 'counts'],
  queryFn: async (): Promise<ListingCounts> => {
    const totals = await Promise.all(COUNTED_STATUSES.map((status) => fetchMyListings({ status, page: 1, limit: 1 })))
    const [all, active, pending, sold, hidden] = totals.map((result) => result.total)
    return { all, active, pending, sold, hidden }
  },
  staleTime: 30_000,
  retry: false,
  retryOnMount: false,
})

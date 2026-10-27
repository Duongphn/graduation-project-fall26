import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import {
  fetchHomeCategories,
  fetchPublicToys,
  type HomeCategory,
  type PublicListingType,
  type PublicToySort,
} from './home-api'

/** Cùng một khai báo cho loader (tải trước) và hook trong section (đọc cache) */

/**
 * Số tin mỗi lần gọi API. Lưới hiện 2 hàng/lần (2–5 cột tuỳ màn hình = 4–10 thẻ) nên một trang
 * đủ cho vài lần "Xem thêm" mà không phải gọi API liên tục.
 */
export const HOME_TOYS_PAGE_SIZE = 20

const HOME_STALE_TIME = 60_000
/** Loader chờ query xong mới render trang: thử lại 1 lần thay vì 3 (mặc định) để lỗi mạng không làm trang treo lâu */
const HOME_RETRY = 1

/** Trang chủ chỉ hiện danh mục gốc; danh mục con xem ở trang duyệt đồ chơi */
export const selectRootCategories = (categories: HomeCategory[]) =>
  categories.filter((category) => category.parentId === null)

export const homeCategoriesQuery = queryOptions({
  queryKey: ['categories', 'with-counts'],
  queryFn: fetchHomeCategories,
  staleTime: 5 * 60_000,
  retry: HOME_RETRY,
})

/** Danh sách tin công khai tải theo trang (page 1, 2, …) — dùng cho nút "Xem thêm" */
const publicToysInfiniteQuery = (listingType: PublicListingType, sort: PublicToySort) =>
  infiniteQueryOptions({
    queryKey: ['public-toys', listingType, sort, 'pages', HOME_TOYS_PAGE_SIZE],
    queryFn: ({ pageParam }) => fetchPublicToys({ listingType, sort, page: pageParam, limit: HOME_TOYS_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.page * lastPage.limit < lastPage.total ? lastPage.page + 1 : undefined),
    staleTime: HOME_STALE_TIME,
    retry: HOME_RETRY,
  })

/** Đồ cho thuê nổi bật: được thuê nhiều trong tuần trước */
export const featuredRentalsQuery = publicToysInfiniteQuery('rent', 'popular')

/** Đồ cũ bán lại: tin mới nhất trước */
export const resaleToysQuery = publicToysInfiniteQuery('sell', 'newest')

/** Đồ chơi quyên góp (tặng miễn phí): tin mới nhất trước */
export const donateToysQuery = publicToysInfiniteQuery('donate', 'newest')

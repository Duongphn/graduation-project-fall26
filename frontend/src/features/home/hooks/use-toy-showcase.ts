import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { featuredRentalsQuery } from '../home-queries'
import { useGridColumns } from './use-grid-columns'

/** Ban đầu và mỗi lần "Xem thêm" hiện thêm bấy nhiêu hàng thẻ */
const ROWS_PER_STEP = 2

type PublicToysInfiniteOptions = typeof featuredRentalsQuery

/**
 * Lưới đồ chơi hiện theo hàng: 2 hàng đầu, mỗi lần "Xem thêm" thêm 2 hàng.
 * Số thẻ mỗi hàng theo màn hình (2–5 cột); hết phần đã tải thì tự gọi trang tiếp theo.
 */
export function useToyShowcase(options: PublicToysInfiniteOptions) {
  const query = useInfiniteQuery(options)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  const columns = useGridColumns()
  const [rows, setRows] = useState(ROWS_PER_STEP)

  const loadedItems = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const total = query.data?.pages[0]?.total ?? 0
  const visibleCount = rows * columns

  // Cần hiện nhiều hơn phần đã tải → gọi trang tiếp theo
  useEffect(() => {
    if (visibleCount > loadedItems.length && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [visibleCount, loadedItems.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  return {
    query,
    items: loadedItems.slice(0, visibleCount),
    total,
    hasMore: loadedItems.length > visibleCount || Boolean(hasNextPage),
    isLoadingMore: isFetchingNextPage,
    /** Số thẻ khung khi đang tải lần đầu / khi chưa có tin: đúng 2 hàng */
    placeholderCount: ROWS_PER_STEP * columns,
    showMore: () => setRows((current) => current + ROWS_PER_STEP),
  }
}

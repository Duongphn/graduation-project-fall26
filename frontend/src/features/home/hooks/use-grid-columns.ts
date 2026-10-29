import { useSyncExternalStore } from 'react'

/**
 * Số cột của `.toy-grid` theo chiều rộng màn hình — PHẢI khớp home.css:
 * `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` (md 768px, lg 1024px, xl 1280px).
 */
const COLUMN_BREAKPOINTS: { query: string; columns: number }[] = [
  { query: '(min-width: 80rem)', columns: 5 },
  { query: '(min-width: 64rem)', columns: 4 },
  { query: '(min-width: 48rem)', columns: 3 },
]
const BASE_COLUMNS = 2

const subscribe = (onChange: () => void) => {
  const lists = COLUMN_BREAKPOINTS.map(({ query }) => window.matchMedia(query))
  lists.forEach((list) => list.addEventListener('change', onChange))
  return () => lists.forEach((list) => list.removeEventListener('change', onChange))
}

const getSnapshot = () =>
  COLUMN_BREAKPOINTS.find(({ query }) => window.matchMedia(query).matches)?.columns ?? BASE_COLUMNS

/** Số thẻ trên một hàng của lưới đồ chơi ở kích thước màn hình hiện tại (tự cập nhật khi xoay/đổi cỡ) */
export function useGridColumns(): number {
  return useSyncExternalStore(subscribe, getSnapshot)
}

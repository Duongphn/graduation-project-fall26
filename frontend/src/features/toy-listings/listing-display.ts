import type { ListingStatus } from './toy-listing-api'

/** Nhãn hiển thị dùng chung cho trang danh sách và trang sửa tin */

export const LISTING_STATUSES: ListingStatus[] = ['active', 'pending', 'sold', 'hidden']

export const STATUS_LABELS: Record<ListingStatus, string> = {
  pending: 'Chờ duyệt',
  active: 'Đang hiển thị',
  hidden: 'Đã ẩn',
  sold: 'Đã bán',
}

export function isListingStatus(value: string | null): value is ListingStatus {
  return value !== null && (LISTING_STATUSES as string[]).includes(value)
}

/** Mã hiển thị ngắn gọn cho tin đăng, vd. #TF-8A42C */
export const displayCode = (toyId: string) => `#TF-${toyId.slice(-5).toUpperCase()}`

const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

export const formatDate = (iso: string) => dateFormatter.format(new Date(iso))
export function parseMyListingsSearch(searchParams: URLSearchParams) {
  const rawStatus = searchParams.get('status')
  const page = Number(searchParams.get('page'))
  return {
    status: isListingStatus(rawStatus) ? rawStatus : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

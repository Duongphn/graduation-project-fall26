import type { ListingStatus, ToyListing } from './toy-listing-api'

/** Nhãn hiển thị dùng chung cho trang danh sách và trang sửa tin */

export const LISTING_STATUSES: ListingStatus[] = ['active', 'pending', 'sold', 'hidden']

export const STATUS_LABELS: Record<ListingStatus, string> = {
  pending: 'Chờ duyệt',
  active: 'Đang hiển thị',
  hidden: 'Đã ẩn',
  sold: 'Đã bán',
}

/** Tin bị Admin từ chối: ẩn kèm lý do (R03 III.3.2.1: nhãn "Bị từ chối" và "Xem lý do") */
export const REJECTED_LABEL = 'Bị từ chối'
export const isRejected = (listing: Pick<ToyListing, 'status' | 'moderation'>) =>
  listing.status === 'hidden' && Boolean(listing.moderation?.rejectReason)

/** Tin đã được Admin duyệt thì không đổi được loại tin (GB-09), kể cả khi đang chờ duyệt lại sau khi sửa */
export const isListingTypeLocked = (listing: Pick<ToyListing, 'status' | 'moderation'>) =>
  listing.status === 'active' ||
  listing.status === 'sold' ||
  (Boolean(listing.moderation?.reviewedAt) && !listing.moderation?.rejectReason)

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

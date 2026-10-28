import { useQuery } from '@tanstack/react-query'
import { ImageOff } from 'lucide-react'
import { toyDetailQuery } from '../../toy-catalog/toy-catalog-queries'
import type { RentalStatus } from '../rental-orders-api'
import { RENTAL_STATUS_META, formatDayMonth, formatWeekday, rentalDays } from '../rental-display'

export function RentalStatusBadge({ status }: { status: RentalStatus }) {
  const meta = RENTAL_STATUS_META[status]
  return <span className={`rental-status rental-status--${meta.tone}`}>{meta.label}</span>
}

/**
 * Đơn thuê chỉ lưu toyId: tên và ảnh lấy từ GET /toys/:id (dùng chung cache với trang chi tiết đồ chơi).
 * Tin đã ẩn/xoá thì trả 404 — hiện chỗ trống thay vì báo lỗi cả hàng.
 */
export function RentalToyImage({ toyId, className }: { toyId: string; className: string }) {
  const toy = useQuery({ ...toyDetailQuery(toyId), staleTime: 5 * 60_000 })
  const image = toy.data?.images[0]
  if (image) return <img src={image.url} alt="" loading="lazy" className={className} />
  return (
    <span className={`${className} rental-thumb--empty`} aria-hidden="true">
      {toy.isPending ? null : <ImageOff />}
    </span>
  )
}

export function RentalToyTitle({ toyId, className }: { toyId: string; className: string }) {
  const toy = useQuery({ ...toyDetailQuery(toyId), staleTime: 5 * 60_000 })
  if (toy.isPending) return <span className={`${className} rental-skeleton-text`} aria-hidden="true" />
  return <span className={className}>{toy.data?.title ?? 'Tin đồ chơi đã ẩn hoặc bị xoá'}</span>
}

/** Khối ngày nhận → ngày trả, dùng ở hàng danh sách và đầu trang chi tiết */
export function RentalPeriod({ period }: { period: { startDate: string; endDate: string } }) {
  const days = rentalDays(period)
  return (
    <span className="rental-period">
      <span className="rental-period__day">
        <strong>{formatDayMonth(period.startDate)}</strong>
        <small>{formatWeekday(period.startDate)}</small>
      </span>
      <span className="rental-period__line" aria-hidden="true">
        <span>{days} ngày</span>
      </span>
      <span className="rental-period__day">
        <strong>{formatDayMonth(period.endDate)}</strong>
        <small>{formatWeekday(period.endDate)}</small>
      </span>
      <span className="sr-only">
        Từ {period.startDate} đến {period.endDate}, {days} ngày
      </span>
    </span>
  )
}

import { ImageOff } from 'lucide-react'
import type { RentalStatus } from '../rental-orders-api'
import { RENTAL_STATUS_META, formatDayMonth, formatWeekday, rentalDays } from '../rental-display'

export function RentalStatusBadge({ status }: { status: RentalStatus }) {
  const meta = RENTAL_STATUS_META[status]
  return <span className={`rental-status rental-status--${meta.tone}`}>{meta.label}</span>
}

/** Ảnh đồ chơi server gửi kèm đơn (danh sách, chi tiết); tin đã ẩn/xoá hoặc không có ảnh thì hiện ô trống */
export function RentalThumb({ src, className }: { src: string | undefined; className: string }) {
  if (src) return <img src={src} alt="" loading="lazy" className={className} />
  return (
    <span className={`${className} rental-thumb--empty`} aria-hidden="true">
      <ImageOff />
    </span>
  )
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

import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import type { RentalStatus } from './rental-orders-api'

/** Nhãn và tông màu trạng thái đơn thuê; tông map sang class .rental-status--{tone} */
export const RENTAL_STATUS_META: Record<RentalStatus, { label: string; tone: 'wait' | 'go' | 'done' | 'stop' | 'alert' }> = {
  PENDING: { label: 'Chờ duyệt', tone: 'wait' },
  ACCEPTED: { label: 'Chờ thanh toán', tone: 'go' },
  PAID: { label: 'Đã thanh toán', tone: 'go' },
  SHIPPING: { label: 'Đang giao', tone: 'go' },
  IN_USE: { label: 'Đang thuê', tone: 'go' },
  RETURNING: { label: 'Đang trả đồ', tone: 'go' },
  COMPLETED: { label: 'Hoàn tất', tone: 'done' },
  REJECTED: { label: 'Đã từ chối', tone: 'stop' },
  CANCELLED: { label: 'Đã huỷ', tone: 'stop' },
  EXPIRED: { label: 'Quá hạn', tone: 'stop' },
  DISPUTING: { label: 'Đang khiếu nại', tone: 'alert' },
}

/** Bộ lọc của chủ đồ: các bước cần chú ý trước, sau đó là kết cục */
export const OWNER_STATUS_FILTERS: readonly RentalStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PAID',
  'IN_USE',
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
]

/** Bộ lọc của người thuê: việc cần làm (thanh toán, nhận đồ) trước, kết cục sau */
export const RENTER_STATUS_FILTERS: readonly RentalStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PAID',
  'SHIPPING',
  'IN_USE',
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
]

/** Lý do từ chối gợi ý — chủ đồ vẫn sửa được (5–500 ký tự như server) */
export const OWNER_REJECT_REASON_PRESETS = [
  'Đồ chơi đang cần sửa chữa, chưa cho thuê được.',
  'Mình không sắp xếp được thời gian giao nhận trong những ngày này.',
  'Mình cần dùng đồ chơi trong khoảng thời gian này.',
  'Điểm tin cậy của người thuê chưa phù hợp với món đồ này.',
] as const

const dayMonth = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' })
const dayMonthYear = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' })
const dateTime = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export const formatDayMonth = (date: string) => dayMonth.format(dayjs(date).toDate())
export const formatFullDate = (date: string) => dayMonthYear.format(dayjs(date).toDate())
export const formatWeekday = (date: string) => weekday.format(dayjs(date).toDate())
export const formatDateTime = (date: string) => dateTime.format(new Date(date))

/** Số ngày thuê tính cả ngày nhận và ngày trả */
export const rentalDays = (period: { startDate: string; endDate: string }) =>
  dayjs(period.endDate).diff(dayjs(period.startDate), 'day') + 1

/** "còn 5 giờ 12 phút" / "còn 2 ngày 3 giờ"; null khi đã quá hạn */
export const formatRemaining = (dueAt: string, now: number): string | null => {
  const ms = new Date(dueAt).getTime() - now
  if (ms <= 0) return null
  const minutes = Math.floor(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `còn ${days} ngày ${hours} giờ`
  if (hours > 0) return `còn ${hours} giờ ${mins} phút`
  return `còn ${Math.max(mins, 1)} phút`
}

/** Thời điểm hiện tại, cập nhật định kỳ để đếm ngược hạn phản hồi/thanh toán */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

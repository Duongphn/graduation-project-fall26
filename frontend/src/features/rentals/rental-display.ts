import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import type { RentalOrder, RentalRole, RentalStatus } from './rental-orders-api'

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
  'SHIPPING',
  'IN_USE',
  'RETURNING',
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
  'RETURNING',
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

/** Hạn trả là hết ngày endDate: "còn 3 ngày" / "trả trong hôm nay" / "trễ 2 ngày" */
export const describeReturnDue = (endDate: string, now: number): { text: string; late: boolean; today: boolean } => {
  const daysLeft = dayjs(endDate).startOf('day').diff(dayjs(now).startOf('day'), 'day')
  if (daysLeft > 0) return { text: `còn ${daysLeft} ngày`, late: false, today: false }
  if (daysLeft === 0) return { text: 'trả trong hôm nay', late: false, today: true }
  return { text: `trễ ${-daysLeft} ngày`, late: true, today: false }
}

const DAY_MS = 86_400_000

/**
 * Phí trả trễ tạm tính nếu gửi trả lúc `now`, theo cách server chốt: hạn là 00:00 (giờ VN) sau ngày trả,
 * mỗi ngày trễ (làm tròn lên) tính bằng một ngày thuê, tối đa bằng tiền cọc. Con số cuối do server tính.
 */
export const estimateLateFee = (order: Pick<RentalOrder, 'period' | 'pricing'>, now: number) => {
  const dueAt = Date.parse(`${order.period.endDate}T00:00:00+07:00`) + DAY_MS
  const lateDays = now > dueAt ? Math.ceil((now - dueAt) / DAY_MS) : 0
  const lateFee = Math.min(lateDays * order.pricing.dailyRate, order.pricing.depositAmount)
  return { lateDays, lateFee }
}

/** Tỷ lệ phí huỷ mặc định của server (cấu hình được): % tiền thuê khi người thuê huỷ đơn đã thanh toán */
export const DEFAULT_CANCEL_FEE_RATE = 0.2

/** Lý do huỷ gợi ý theo vai trò; người dùng vẫn sửa được (5–500 ký tự như server) */
export const CANCEL_REASON_PRESETS: Record<RentalRole, readonly string[]> = {
  renter: [
    'Gia đình đổi kế hoạch, không còn cần thuê nữa.',
    'Mình đã tìm được món đồ chơi khác phù hợp hơn.',
    'Chủ đồ chưa giao đúng hẹn.',
  ],
  owner: [
    'Đồ chơi bị hỏng, chưa thể cho thuê.',
    'Mình không sắp xếp được việc giao đồ trong những ngày này.',
    'Mình cần dùng đồ chơi trong khoảng thời gian này.',
  ],
}

export type CancelPreview =
  | { allowed: true; paid: boolean; fee: number; refund: number; feeWaived: boolean }
  | { allowed: false; reason: 'shipped' | 'use-reject' | 'closed' }

/**
 * Hệ quả nếu huỷ lúc `now`, theo chính sách huỷ của server: chờ duyệt/chờ thanh toán thì chưa có tiền;
 * đã thanh toán thì chủ đồ huỷ hoàn 100%, người thuê huỷ mất phí (miễn khi tới ngày nhận mà chưa được giao);
 * từ lúc giao trở đi thì không huỷ được. Phí cuối cùng do server chốt.
 */
export const previewCancel = (order: RentalOrder, role: RentalRole, now: number): CancelPreview => {
  switch (order.status) {
    case 'PENDING':
      return role === 'owner'
        ? { allowed: false, reason: 'use-reject' }
        : { allowed: true, paid: false, fee: 0, refund: 0, feeWaived: false }
    case 'ACCEPTED':
      return { allowed: true, paid: false, fee: 0, refund: 0, feeWaived: false }
    case 'PAID': {
      const total = order.pricing.totalPayable
      if (role === 'owner') return { allowed: true, paid: true, fee: 0, refund: total, feeWaived: false }
      const rentalStarted = now >= Date.parse(`${order.period.startDate}T00:00:00+07:00`)
      const fee = rentalStarted ? 0 : Math.min(Math.round(DEFAULT_CANCEL_FEE_RATE * order.pricing.rentalFee), total)
      return { allowed: true, paid: true, fee, refund: total - fee, feeWaived: rentalStarted }
    }
    case 'SHIPPING':
    case 'IN_USE':
    case 'RETURNING':
    case 'DISPUTING':
      return { allowed: false, reason: 'shipped' }
    default:
      return { allowed: false, reason: 'closed' }
  }
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

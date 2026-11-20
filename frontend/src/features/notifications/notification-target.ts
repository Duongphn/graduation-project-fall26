import { PATHS } from '../../routes/paths'
import type { AppNotification, NotificationType } from './notifications-api'

// Older notifications (before the server stored a link) open the list page of their type.
const FALLBACK_PATHS: Partial<Record<NotificationType, string>> = {
  IDENTITY_REVIEWED: PATHS.identityVerification,
  TOY_REVIEWED: PATHS.myListings,
}

/** Only app paths are followed: a notification never sends the user to another site. */
const isAppPath = (link: string) => /^\/(?!\/)/.test(link)

/** Trang mà thông báo mở ra: link do máy chủ lưu, hoặc trang danh sách theo loại với thông báo cũ */
export function notificationTargetPath({ type, link }: Pick<AppNotification, 'type' | 'link'>): string | null {
  if (link && isAppPath(link)) return link
  return FALLBACK_PATHS[type] ?? null
}

/** Tên loại thông báo trên trang cài đặt */
export const notificationTypeLabels: Record<NotificationType, string> = {
  RENTAL_ORDER: 'Đơn thuê',
  PURCHASE_ORDER: 'Đơn mua',
  PAYMENT: 'Thanh toán',
  WALLET: 'Ví và rút tiền',
  DISPUTE: 'Khiếu nại',
  TOY_REVIEWED: 'Duyệt tin đăng',
  IDENTITY_REVIEWED: 'Xác minh danh tính',
  DONATION_STATUS_CHANGED: 'Quyên góp',
  ACCOUNT: 'Tài khoản',
  VIOLATION_REPORT: 'Báo cáo vi phạm',
  CHAT_MESSAGE: 'Tin nhắn',
  VOUCHER: 'Mã giảm giá',
  REVIEW: 'Đánh giá',
  REMINDER: 'Nhắc nhở',
  SYSTEM: 'Hệ thống',
}

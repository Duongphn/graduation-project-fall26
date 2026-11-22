import { reportReasonLabels, reportTargetKindLabels } from '../../constants/labels'
import { statusStyles } from '../../styles/status'
import type { AuditTargetType } from './types'

// Vietnamese labels of the audit log. An action without a label is shown with its code.

export const auditAreaLabels: Record<string, string> = {
  toy: 'Tin đăng',
  identity: 'Xác minh danh tính',
  category: 'Danh mục',
  organization: 'Tổ chức từ thiện',
  donation: 'Quyên góp',
  user: 'Tài khoản',
  report: 'Báo cáo vi phạm',
  chat: 'Tin nhắn',
  wallet: 'Ví',
}

export const auditActionLabels: Record<string, string> = {
  'toy.approve': 'Duyệt tin đăng',
  'toy.reject': 'Từ chối tin đăng',
  'toy.remove': 'Gỡ tin đăng vi phạm',
  'identity.verify': 'Duyệt xác minh danh tính',
  'identity.reject': 'Từ chối xác minh danh tính',
  'identity.view_documents': 'Xem giấy tờ tùy thân',
  'category.create': 'Thêm danh mục',
  'category.update': 'Sửa danh mục',
  'category.hide': 'Ẩn danh mục',
  'category.show': 'Hiện danh mục',
  'category.delete': 'Xóa danh mục',
  'category.reorder': 'Sắp xếp danh mục',
  'organization.create': 'Thêm tổ chức',
  'organization.update': 'Sửa tổ chức',
  'organization.hide': 'Ẩn tổ chức',
  'organization.show': 'Hiện tổ chức',
  'organization.delete': 'Xóa tổ chức',
  'donation.create': 'Tạo yêu cầu quyên góp',
  'donation.accept': 'Chấp nhận yêu cầu quyên góp',
  'donation.reject': 'Từ chối yêu cầu quyên góp',
  'donation.cancel': 'Hủy yêu cầu quyên góp',
  'donation.hand_over': 'Ghi nhận bàn giao',
  'donation.confirm_received': 'Xác nhận đã nhận',
  'donation.expire': 'Hết hạn yêu cầu quyên góp',
  'user.lock': 'Khóa tài khoản',
  'user.unlock': 'Mở khóa tài khoản',
  'user.warn': 'Cảnh cáo người dùng',
  'report.dismiss': 'Bỏ qua báo cáo',
  'report.remove_listing': 'Xử lý báo cáo: gỡ tin',
  'report.warn': 'Xử lý báo cáo: cảnh cáo',
  'report.lock': 'Xử lý báo cáo: khóa tài khoản',
  'chat.contact_masked': 'Che thông tin liên hệ trong tin nhắn',
  'wallet.credit': 'Cộng tiền vào ví',
}

export const auditActionLabel = (action: string): string =>
  auditActionLabels[action] ?? action

export const auditTargetLabels: Record<AuditTargetType, string> = {
  CATEGORY: 'Danh mục',
  ORGANIZATION: 'Tổ chức',
  TOY: 'Tin đăng',
  DONATION_REQUEST: 'Yêu cầu quyên góp',
  IDENTITY_VERIFICATION: 'Yêu cầu xác minh',
  USER: 'Tài khoản',
  VIOLATION_REPORT: 'Báo cáo vi phạm',
  MESSAGE: 'Tin nhắn',
}

// Keys of `details`, shown as "label: value".
export const auditDetailLabels: Record<string, string> = {
  name: 'Tên',
  reason: 'Lý do',
  from: 'Từ',
  to: 'Sang',
  duration: 'Thời hạn',
  until: 'Đến',
  hiddenListings: 'Tin bị ẩn',
  restoredListings: 'Tin hiện lại',
  expired: 'Hết hạn khóa',
  reportId: 'Báo cáo',
  targetKind: 'Loại đối tượng',
  lockDuration: 'Thời hạn khóa',
  closedWithIt: 'Báo cáo đóng kèm',
  amount: 'Số tiền',
  note: 'Ghi chú',
}

// `from` / `to` are donation request statuses (the only transition the server logs with them).
const donationStatusLabels: Record<string, string> = Object.fromEntries(
  Object.entries(statusStyles.donation).map(([status, style]) => [status, style.label]),
)

// Coded values inside `details` (status change, report target, reason, lock length), shown in Vietnamese.
// A free-text value (a lock reason typed by the Admin) has no entry and is shown as written.
export const auditDetailValueLabels: Record<string, Record<string, string>> = {
  from: donationStatusLabels,
  to: donationStatusLabels,
  targetKind: reportTargetKindLabels,
  reason: reportReasonLabels,
  lockDuration: { '7d': '7 ngày', '30d': '30 ngày', permanent: 'Vĩnh viễn' },
  duration: { '7d': '7 ngày', '30d': '30 ngày', permanent: 'Vĩnh viễn' },
}

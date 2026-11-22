import type {
  ActorType,
  DonationReceiverType,
  HandoverStep,
  ListingType,
  LockDuration,
  ReportAction,
  ReportReason,
  ReportTargetKind,
  UnsafeIssue,
} from './domain'

// Vietnamese labels of the value lists that are not statuses (statuses: src/styles/status.ts).

export const listingTypeLabels: Record<ListingType, string> = {
  rent: 'Cho thuê',
  sell: 'Bán lại',
  donate: 'Tặng',
}

export const donationReceiverTypeLabels: Record<DonationReceiverType, string> = {
  USER: 'Cá nhân',
  ORGANIZATION: 'Tổ chức',
}

export const actorTypeLabels: Record<ActorType, string> = {
  USER: 'Người dùng',
  ADMIN: 'Quản trị viên',
  SYSTEM: 'Hệ thống',
}

export const handoverStepLabels: Record<HandoverStep, string> = {
  DONOR_SENT: 'Người tặng gửi đồ chơi',
  RECEIVER_RECEIVED: 'Bên nhận đã nhận',
}

export const reportTargetKindLabels: Record<ReportTargetKind, string> = {
  toy: 'Tin đăng',
  user: 'Người dùng',
  message: 'Tin nhắn',
}

export const reportReasonLabels: Record<ReportReason, string> = {
  unsafe_toy: 'Đồ chơi không an toàn',
  scam: 'Lừa đảo, gian lận',
  wrong_description: 'Mô tả sai sự thật',
  prohibited_item: 'Hàng cấm hoặc không phù hợp với trẻ em',
  contact_outside: 'Giao dịch ngoài ToyFlow',
  harassment: 'Quấy rối, xúc phạm',
  spam: 'Spam, quảng cáo',
  other: 'Lý do khác',
}

export const unsafeIssueLabels: Record<UnsafeIssue, string> = {
  small_parts: 'Chi tiết nhỏ',
  broken_or_sharp: 'Bị vỡ hoặc có cạnh sắc',
  battery: 'Pin, ngăn pin',
  recalled: 'Đồ chơi đã bị thu hồi',
  smell_or_paint: 'Mùi lạ hoặc bong sơn',
  other: 'Vấn đề khác',
}

export const reportActionLabels: Record<ReportAction, string> = {
  dismiss: 'Bỏ qua',
  remove_listing: 'Gỡ tin đăng',
  warn: 'Cảnh cáo',
  lock: 'Khóa tài khoản',
}

export const lockDurationLabels: Record<LockDuration, string> = {
  '7d': 'Khóa 7 ngày',
  '30d': 'Khóa 30 ngày',
  permanent: 'Khóa vĩnh viễn',
}

// [{ value, label }] for antd Select / Segmented, in the order of the label map.
export const toOptions = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label }))

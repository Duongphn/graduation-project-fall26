import type {
  DisputeStatus,
  ListingType,
  DonationStatus,
  IdentityStatus,
  PaymentStatus,
  RentalOrderStatus,
  ReportStatus,
  ResaleOrderStatus,
  ToyStatus,
  UserStatus,
  VisibilityStatus,
  WithdrawalStatus,
} from '../constants/domain'
import { palettes, type Palette } from './palette'

// Colour tone and Vietnamese label of every status shown in the UI, per domain: the same value
// (e.g. ACTIVE or PENDING) means different things for a toy, a category or a donation.
// Add statuses here, never in components. Values come from src/constants/domain.ts.
export type StatusTone = 'default' | 'processing' | 'success' | 'warning' | 'error'

export interface StatusStyle {
  label: string
  tone: StatusTone
}

type StatusMap<S extends string> = Readonly<Record<S, StatusStyle>>

export const statusStyles = {
  toy: {
    PENDING_REVIEW: { label: 'Chờ duyệt', tone: 'warning' },
    ACTIVE: { label: 'Đang hiển thị', tone: 'success' },
    REJECTED: { label: 'Bị từ chối', tone: 'error' },
    RESERVED: { label: 'Đang giữ chỗ', tone: 'processing' },
    SOLD: { label: 'Đã bán', tone: 'default' },
    DONATED: { label: 'Đã tặng', tone: 'default' },
    HIDDEN: { label: 'Đã ẩn', tone: 'default' },
  },
  identity: {
    UNVERIFIED: { label: 'Chưa xác minh', tone: 'default' },
    PENDING: { label: 'Chờ duyệt', tone: 'warning' },
    VERIFIED: { label: 'Đã xác minh', tone: 'success' },
    REJECTED: { label: 'Bị từ chối', tone: 'error' },
  },
  user: {
    ACTIVE: { label: 'Hoạt động', tone: 'success' },
    LOCKED: { label: 'Đã khoá', tone: 'error' },
  },
  // Categories and organizations.
  visibility: {
    ACTIVE: { label: 'Đang dùng', tone: 'success' },
    HIDDEN: { label: 'Đã ẩn', tone: 'default' },
  },
  donation: {
    PENDING: { label: 'Chờ xác nhận', tone: 'warning' },
    ACCEPTED: { label: 'Đã chấp nhận', tone: 'processing' },
    SHIPPING: { label: 'Đang bàn giao', tone: 'processing' },
    COMPLETED: { label: 'Hoàn tất', tone: 'success' },
    REJECTED: { label: 'Bị từ chối', tone: 'error' },
    CANCELLED: { label: 'Đã huỷ', tone: 'default' },
  },
  rental: {
    REQUESTED: { label: 'Chờ chủ đồ chơi', tone: 'warning' },
    ACCEPTED: { label: 'Chờ thanh toán', tone: 'processing' },
    PAID: { label: 'Đã thanh toán', tone: 'processing' },
    SHIPPING: { label: 'Đang bàn giao', tone: 'processing' },
    IN_USE: { label: 'Đang thuê', tone: 'processing' },
    RETURNING: { label: 'Đang trả', tone: 'processing' },
    COMPLETED: { label: 'Hoàn tất', tone: 'success' },
    CANCELLED: { label: 'Đã huỷ', tone: 'default' },
    DISPUTED: { label: 'Đang khiếu nại', tone: 'error' },
  },
  resale: {
    PAID: { label: 'Đã thanh toán', tone: 'processing' },
    CONFIRMED: { label: 'Người bán đã xác nhận', tone: 'processing' },
    SHIPPING: { label: 'Đang bàn giao', tone: 'processing' },
    DELIVERED: { label: 'Đã giao', tone: 'processing' },
    COMPLETED: { label: 'Hoàn tất', tone: 'success' },
    CANCELLED: { label: 'Đã huỷ', tone: 'default' },
    DISPUTED: { label: 'Đang khiếu nại', tone: 'error' },
  },
  dispute: {
    OPEN: { label: 'Mới mở', tone: 'warning' },
    UNDER_REVIEW: { label: 'Đang xem xét', tone: 'processing' },
    RESOLVED: { label: 'Đã phân xử', tone: 'success' },
  },
  payment: {
    PENDING: { label: 'Đang chờ', tone: 'warning' },
    SUCCEEDED: { label: 'Thành công', tone: 'success' },
    FAILED: { label: 'Thất bại', tone: 'error' },
    EXPIRED: { label: 'Hết hạn', tone: 'default' },
  },
  withdrawal: {
    PENDING: { label: 'Chờ xử lý', tone: 'warning' },
    COMPLETED: { label: 'Đã chuyển', tone: 'success' },
    REJECTED: { label: 'Bị từ chối', tone: 'error' },
  },
  report: {
    PENDING: { label: 'Chờ xử lý', tone: 'warning' },
    RESOLVED: { label: 'Đã xử lý', tone: 'success' },
    DISMISSED: { label: 'Bỏ qua', tone: 'default' },
  },
} as const satisfies {
  toy: StatusMap<ToyStatus>
  identity: StatusMap<IdentityStatus>
  user: StatusMap<UserStatus>
  visibility: StatusMap<VisibilityStatus>
  donation: StatusMap<DonationStatus>
  rental: StatusMap<RentalOrderStatus>
  resale: StatusMap<ResaleOrderStatus>
  dispute: StatusMap<DisputeStatus>
  payment: StatusMap<PaymentStatus>
  withdrawal: StatusMap<WithdrawalStatus>
  report: StatusMap<ReportStatus>
}

export type StatusDomain = keyof typeof statusStyles
export type StatusOf<D extends StatusDomain> = keyof (typeof statusStyles)[D] & string

const toneColorsOf = (palette: Palette): Record<StatusTone, string> => ({
  default: palette.textMuted,
  processing: palette.info,
  success: palette.success,
  warning: palette.warning,
  error: palette.danger,
})

export const toneColors = toneColorsOf(palettes.light)
export const darkToneColors = toneColorsOf(palettes.dark)

export const getStatusStyle = <D extends StatusDomain>(domain: D, status: string): StatusStyle =>
  (statusStyles[domain] as Record<string, StatusStyle>)[status] ?? {
    label: status,
    tone: 'default',
  }

// [{ value, label }] for a Select, Tabs or Segmented, optionally limited to some statuses.
export const statusOptions = <D extends StatusDomain>(
  domain: D,
  only?: readonly StatusOf<D>[],
): Array<{ value: StatusOf<D>; label: string }> => {
  const values = only ?? (Object.keys(statusStyles[domain]) as StatusOf<D>[])
  return values.map((value) => ({ value, label: getStatusStyle(domain, value).label }))
}

// Colour of each listing type (ListingTypeTag): not a status, but shown the same way.
export const listingTypeColors: Record<ListingType, string> = {
  RENT: palettes.light.primary,
  SALE: palettes.light.secondary,
  DONATION: palettes.light.success,
}

import type {
  DonationStatus,
  IdentityStatus,
  ListingType,
  ToyStatus,
  UserStatus,
  VisibilityStatus,
} from '../constants/domain'
import { palette } from './palette'

// Colour tone and Vietnamese label of every status shown in the UI, per domain: the same value
// (e.g. active or pending) means different things for a toy, a category or a donation.
// Add statuses here, never in components. Values come from src/constants/domain.ts.
export type StatusTone = 'default' | 'processing' | 'success' | 'warning' | 'error'

export interface StatusStyle {
  label: string
  tone: StatusTone
}

type StatusMap<S extends string> = Readonly<Record<S, StatusStyle>>

export const statusStyles = {
  toy: {
    pending: { label: 'Chờ duyệt', tone: 'warning' },
    active: { label: 'Đang hiển thị', tone: 'success' },
    hidden: { label: 'Đã ẩn', tone: 'default' },
  },
  identity: {
    unverified: { label: 'Chưa xác minh', tone: 'default' },
    pending: { label: 'Chờ duyệt', tone: 'warning' },
    verified: { label: 'Đã xác minh', tone: 'success' },
    rejected: { label: 'Bị từ chối', tone: 'error' },
  },
  user: {
    ACTIVE: { label: 'Hoạt động', tone: 'success' },
    LOCKED: { label: 'Đã khoá', tone: 'error' },
  },
  // Categories and organizations.
  visibility: {
    active: { label: 'Đang dùng', tone: 'success' },
    hidden: { label: 'Đã ẩn', tone: 'default' },
  },
  donation: {
    pending: { label: 'Chờ xác nhận', tone: 'warning' },
    accepted: { label: 'Đã chấp nhận', tone: 'processing' },
    shipping: { label: 'Đang bàn giao', tone: 'processing' },
    received: { label: 'Đã nhận', tone: 'processing' },
    completed: { label: 'Hoàn tất', tone: 'success' },
    rejected: { label: 'Bị từ chối', tone: 'error' },
    cancelled: { label: 'Đã huỷ', tone: 'default' },
  },
} as const satisfies {
  toy: StatusMap<ToyStatus>
  identity: StatusMap<IdentityStatus>
  user: StatusMap<UserStatus>
  visibility: StatusMap<VisibilityStatus>
  donation: StatusMap<DonationStatus>
}

export type StatusDomain = keyof typeof statusStyles
export type StatusOf<D extends StatusDomain> = keyof (typeof statusStyles)[D] & string

export const toneColors: Record<StatusTone, string> = {
  default: palette.textMuted,
  processing: palette.info,
  success: palette.success,
  warning: palette.warning,
  error: palette.danger,
}

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
  rent: palette.primary,
  sell: palette.secondary,
  donate: palette.success,
}

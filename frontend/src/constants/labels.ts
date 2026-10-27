import type { ActorType, DonationReceiverType, HandoverStep, ListingType } from './domain'

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

// [{ value, label }] for antd Select / Segmented, in the order of the label map.
export const toOptions = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label }))

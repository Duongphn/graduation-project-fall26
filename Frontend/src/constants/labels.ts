import type {
  ActorType,
  AgeGroup,
  DonationReceiverType,
  HandoverStep,
  ListingType,
  ToyCondition,
} from './domain'

// Vietnamese labels of the value lists that are not statuses (statuses: src/styles/status.ts).

export const listingTypeLabels: Record<ListingType, string> = {
  RENT: 'Cho thuê',
  SALE: 'Bán lại',
  DONATION: 'Tặng',
}

export const toyConditionLabels: Record<ToyCondition, string> = {
  NEW: 'Mới',
  LIKE_NEW: 'Như mới',
  GOOD: 'Tốt',
  FAIR: 'Đã qua sử dụng',
}

export const ageGroupLabels: Record<AgeGroup, string> = {
  AGE_0_2: '0–2 tuổi',
  AGE_3_5: '3–5 tuổi',
  AGE_6_8: '6–8 tuổi',
  AGE_9_12: '9–12 tuổi',
  AGE_13_PLUS: 'Từ 13 tuổi',
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

import type { IdentityDocumentKey } from './types'

// GB-07 minimum user age (label only: develop's users have no date of birth).
const USER_MIN_AGE_YEARS = 18

export const identityDocuments: ReadonlyArray<{ key: IdentityDocumentKey; label: string }> = [
  { key: 'frontImage', label: 'Mặt trước CCCD' },
  { key: 'backImage', label: 'Mặt sau CCCD' },
  { key: 'selfie', label: 'Ảnh chân dung' },
]

// Visual aid only: the Admin checks the documents by hand (FE-01, LI-04); nothing is stored.
export const identityChecklist = [
  { value: 'clear', label: 'Ảnh rõ nét, đọc được đầy đủ thông tin' },
  { value: 'matchingInfo', label: 'Họ tên, ngày sinh trên CCCD khớp với tài khoản' },
  { value: 'matchingFace', label: 'Ảnh chân dung khớp với ảnh trên CCCD' },
  { value: 'notExpired', label: 'CCCD còn hạn sử dụng' },
  { value: 'adult', label: `Người dùng đủ ${USER_MIN_AGE_YEARS} tuổi` },
] as const

export const identityRejectReasons = [
  'Ảnh mờ hoặc bị lóa',
  'Ảnh chân dung không khớp với CCCD',
  'CCCD hết hạn hoặc không hợp lệ',
  'Thiếu mặt trước hoặc mặt sau CCCD',
  'Thông tin trên CCCD không khớp với tài khoản',
  `Chưa đủ ${USER_MIN_AGE_YEARS} tuổi`,
] as const

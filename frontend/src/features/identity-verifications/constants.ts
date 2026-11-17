import type { IdentityDocumentKey } from './types'

// GB-07 minimum user age. The user record stores no date of birth (L3): the Admin reads it on the
// citizen ID card during the review and rejects with "Chưa đủ 18 tuổi" otherwise.
const USER_MIN_AGE_YEARS = 18

export const identityDocuments: ReadonlyArray<{ key: IdentityDocumentKey; label: string }> = [
  { key: 'frontImage', label: 'Mặt trước CCCD' },
  { key: 'backImage', label: 'Mặt sau CCCD' },
  { key: 'selfie', label: 'Ảnh chân dung' },
]

// Visual aid only: the Admin checks the documents by hand (FE-01, LI-04); nothing is stored.
export const identityChecklist = [
  { value: 'clear', label: 'Ảnh rõ nét, đọc được đầy đủ thông tin' },
  { value: 'matchingInfo', label: 'Họ tên trên CCCD khớp với tài khoản' },
  { value: 'matchingFace', label: 'Ảnh chân dung khớp với ảnh trên CCCD' },
  { value: 'notExpired', label: 'CCCD còn hạn sử dụng' },
  { value: 'adult', label: `Đủ ${USER_MIN_AGE_YEARS} tuổi theo CCCD` },
] as const

// "Under 18" first: GB-07 names it as the reason for a user younger than 18 on the CCCD.
export const identityRejectReasons = [
  `Chưa đủ ${USER_MIN_AGE_YEARS} tuổi`,
  'Ảnh mờ hoặc bị lóa',
  'Ảnh chân dung không khớp với CCCD',
  'CCCD hết hạn hoặc không hợp lệ',
  'Thiếu mặt trước hoặc mặt sau CCCD',
  'Thông tin trên CCCD không khớp với tài khoản',
] as const

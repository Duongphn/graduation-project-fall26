import type { ToyStatus } from '../../constants/domain'

// Tabs of the queue, in the order the Admin works through them.
export const queueStatusTabs: readonly ToyStatus[] = [
  'PENDING_REVIEW',
  'ACTIVE',
  'REJECTED',
  'HIDDEN',
  'RESERVED',
  'SOLD',
  'DONATED',
]

// Quick reasons for rejecting a post; the Admin can still edit the text.
export const rejectReasonPresets = [
  'Ảnh không rõ hoặc không đủ số lượng',
  'Đồ chơi không an toàn cho trẻ',
  'Danh mục bị cấm hoặc không phù hợp',
  'Mô tả chứa số điện thoại, tài khoản ngân hàng hoặc liên kết ngoài',
  'Giá hoặc tiền cọc không hợp lý',
] as const

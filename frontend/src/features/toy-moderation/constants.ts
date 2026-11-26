import type { ToyStatus } from '../../constants/domain'

// Tabs of the queue, in the order the Admin works through them.
export const queueStatusTabs: readonly ToyStatus[] = [
  'pending',
  'active',
  'hidden',
]

// The Admin safety checklist of UC27 (R03 II.7.2, GB-48): every item must be ticked before a
// post can be approved. Keys match the server's ApproveToyRequest.safetyChecklist.
export const safetyChecklistItems = [
  { key: 'photosShowWholeToy', label: 'Ảnh cho thấy toàn bộ đồ chơi, không có chi tiết vỡ hoặc sắc nhọn' },
  { key: 'ageFitsSmallParts', label: 'Độ tuổi phù hợp với chi tiết nhỏ, nam châm và pin (từ 3 tuổi nếu có)' },
  { key: 'batteryCompartmentSecured', label: 'Ngăn pin (nếu có) được đóng bằng vít' },
  { key: 'notRecalledOrBanned', label: 'Không phải đồ chơi đã bị thu hồi hoặc bị cấm' },
  { key: 'noHiddenDefect', label: 'Mô tả không che giấu lỗi đã biết' },
] as const

export type SafetyChecklistKey = (typeof safetyChecklistItems)[number]['key']

// Quick reasons for rejecting a post; the Admin can still edit the text. The safety reasons come
// first (R03 II.7.2, step 3.1).
export const rejectReasonPresets = [
  'Chi tiết nhỏ không phù hợp với trẻ nhỏ',
  'Đồ chơi đã bị thu hồi hoặc bị cấm',
  'Đồ chơi có chi tiết vỡ hoặc sắc nhọn',
  'Ngăn pin không được cố định chắc chắn',
  'Thiếu thông tin an toàn',
  'Ảnh không rõ hoặc không đủ số lượng',
  'Danh mục bị cấm hoặc không phù hợp',
  'Mô tả chứa số điện thoại, tài khoản ngân hàng hoặc liên kết ngoài',
  'Giá hoặc tiền cọc không hợp lý',
] as const

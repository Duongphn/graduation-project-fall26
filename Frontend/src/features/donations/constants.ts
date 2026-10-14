// Quick reasons offered in the Admin reason modals (content, not statuses).
export const rejectReasonPresets = [
  'Tổ chức không phù hợp với độ tuổi của đồ chơi',
  'Thông tin yêu cầu chưa đầy đủ',
  'Đồ chơi không còn phù hợp để tặng',
] as const

export const cancelReasonPresets = [
  'Người tặng không thể bàn giao đồ chơi',
  'Tổ chức tạm ngừng nhận quà tặng',
  'Hai bên đã thống nhất huỷ yêu cầu',
  'Bàn giao thất bại, đồ chơi không đến được bên nhận',
] as const

// Admin confirmation of a receipt on behalf of the receiver (SHIPPING).
export const confirmReasonPresets = [
  'Tổ chức đã xác nhận qua điện thoại',
  'Bên nhận đã gửi ảnh nhận hàng cho Admin',
  'Người nhận không thao tác được trên ứng dụng',
] as const

// Sortable fields of the Admin list (the backend sortBy enum of this list).
// Mirrors donationRequestSortFields (server donation_requests.schemas.ts).
export const donationSortFields = ['createdAt', 'updatedAt', 'status', 'code'] as const
export type DonationSortField = (typeof donationSortFields)[number]

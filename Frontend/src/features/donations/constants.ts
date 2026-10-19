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

// Donor hands a toy over (POST /donation-requests/:id/handover). The backend has no carrier or
// tracking fields yet, so both are written at the top of the handover note (composeHandoverNote).
export const handoverMethods = ['CARRIER', 'SELF'] as const
export type HandoverMethod = (typeof handoverMethods)[number]

export const handoverMethodLabels: Record<HandoverMethod, string> = {
  CARRIER: 'Gửi qua đơn vị vận chuyển',
  SELF: 'Tự mang đến tận nơi',
}

export const shippingCarriers = [
  'Giao Hàng Nhanh (GHN)',
  'Giao Hàng Tiết Kiệm (GHTK)',
  'Viettel Post',
  'VNPost',
  'J&T Express',
  'Ninja Van',
] as const

// Quick reasons when the Donor cancels a request before shipping.
export const donorCancelReasonPresets = [
  'Tôi không còn muốn tặng đồ chơi này',
  'Đồ chơi bị hỏng, không còn an toàn để tặng',
  'Không liên lạc được với bên nhận',
  'Hai bên đã thống nhất huỷ',
] as const

// Quick reasons when the Donor turns down a request to receive the toy.
export const donorRejectReasonPresets = [
  'Đồ chơi đã được hứa tặng cho người khác',
  'Bên nhận ở quá xa, tôi không gửi được',
  'Đồ chơi không phù hợp với độ tuổi bên nhận',
] as const

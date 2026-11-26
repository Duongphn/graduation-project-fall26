import type { DeliveryAddress, DeliveryMethod, PurchaseOrder, PurchaseRole, PurchaseStatus } from './purchase-api'

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  SHIPPING: 'Đang giao',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã huỷ',
  DISPUTING: 'Đang khiếu nại',
}

export const PURCHASE_STATUS_TONES: Record<PurchaseStatus, string> = {
  PENDING: 'bg-tf-surface text-tf-ink-muted',
  PAID: 'bg-amber-50 text-amber-800',
  SHIPPING: 'bg-sky-50 text-sky-800',
  COMPLETED: 'bg-emerald-50 text-emerald-800',
  CANCELLED: 'bg-tf-surface text-tf-ink-muted',
  DISPUTING: 'bg-red-50 text-red-700',
}

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  DELIVERY: 'Giao tận nơi',
  LOCAL_PICKUP: 'Tự đến lấy',
}

/** Việc người xem cần làm tiếp với đơn này (undefined: không có) */
export function nextAction(order: PurchaseOrder, role: PurchaseRole): string | undefined {
  if (role === 'seller' && order.status === 'PAID') return 'Cần gửi hàng'
  if (role === 'buyer' && order.status === 'SHIPPING') return 'Xác nhận đã nhận'
  return undefined
}

/** "12 Lý Thường Kiệt, Phường Hoàn Kiếm, Hà Nội" — bỏ phần trống */
export const formatAddress = (address: DeliveryAddress) =>
  [address.street, address.ward, address.district, address.province].filter(Boolean).join(', ')

/** Đơn vị vận chuyển cho ô chọn của người bán; "Giao trực tiếp" không cần mã vận đơn */
export const CARRIERS = [
  'Giao Hàng Nhanh (GHN)',
  'Giao Hàng Tiết Kiệm (GHTK)',
  'Viettel Post',
  'J&T Express',
  'SPX Express',
  'Ahamove / Grab Express',
  'Giao trực tiếp',
] as const

export const HAND_DELIVERY = 'Giao trực tiếp'

/** 34 tỉnh, thành sau sắp xếp năm 2025 — gợi ý cho ô Tỉnh/Thành phố (vẫn gõ tự do được) */
export const PROVINCES = [
  'Hà Nội',
  'TP. Hồ Chí Minh',
  'Hải Phòng',
  'Đà Nẵng',
  'Cần Thơ',
  'Huế',
  'An Giang',
  'Bắc Ninh',
  'Cà Mau',
  'Cao Bằng',
  'Đắk Lắk',
  'Điện Biên',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Tĩnh',
  'Hưng Yên',
  'Khánh Hòa',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Nghệ An',
  'Ninh Bình',
  'Phú Thọ',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sơn La',
  'Tây Ninh',
  'Thái Nguyên',
  'Thanh Hóa',
  'Tuyên Quang',
  'Vĩnh Long',
] as const

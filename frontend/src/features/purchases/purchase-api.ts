import { apiGet, apiPost } from '../../services/http'
import type { Paginated } from '../../types/api'

/**
 * Mua bán đồ chơi cũ (UC12 Buy now, UC13 Deliver & receive) — server/src/routes/purchase-order.routes.ts
 * POST /purchase-orders/quote, /buy-now · GET /mine, /sold, /:orderId · POST /:orderId/ship, /:orderId/receive
 */

export type DeliveryMethod = 'DELIVERY' | 'LOCAL_PICKUP'

/** PENDING/CANCELLED/DISPUTING có trong backend nhưng luồng hiện tại chỉ dùng PAID → SHIPPING → COMPLETED */
export type PurchaseStatus = 'PENDING' | 'PAID' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED' | 'DISPUTING'

/** POST /purchase-orders/quote: giá món + phí giao trước khi thanh toán */
export interface PurchaseQuote {
  toyId: string
  title: string
  toyImage?: string
  sellerId: string
  sellerName?: string
  deliveryMethod: DeliveryMethod
  itemPrice: number
  /** 30.000 khi giao tận nơi, 0 khi tự đến lấy */
  shippingFee: number
  /** Hoa hồng (mặc định 5%, Admin đặt ở UC30) trừ vào tiền người bán nhận, người mua không trả thêm */
  platformFee: number
  /** Tỉ lệ hoa hồng dạng phân số (0.05 = 5%); đơn tạo trước UC30 không có */
  platformFeeRate?: number
  /** Người mua trả = giá món + phí giao */
  totalPayable: number
  sellerNet: number
}

export interface DeliveryAddress {
  recipientName: string
  recipientPhone: string
  province?: string
  district?: string
  ward?: string
  street?: string
  notes?: string
}

export interface PurchasePhoto {
  url: string
  publicId?: string
}

export interface PurchaseOrder {
  id: string
  code: string
  buyerId: string
  sellerId: string
  toyId: string
  itemDetails: { title: string; condition?: string; image?: string }
  deliveryMethod: DeliveryMethod
  deliveryInfo?: DeliveryAddress
  shippingInfo?: {
    carrierName: string
    trackingCode?: string
    photos?: PurchasePhoto[]
    shippedAt?: string
    note?: string
  }
  pricing: Pick<PurchaseQuote, 'itemPrice' | 'shippingFee' | 'platformFee' | 'platformFeeRate' | 'totalPayable' | 'sellerNet'>
  /** Các hạn của đơn, lấy từ Cấu hình hệ thống lúc tạo đơn (GB-38); đơn cũ không có thì là 48 giờ / 7 ngày */
  policy?: { shipDeadlineHours: number; autoCompleteDays: number }
  status: PurchaseStatus
  paidAt?: string
  shippedAt?: string
  completedAt?: string
  /** CANCELLED: lúc đơn tự huỷ vì người bán không gửi hàng trong 48 giờ */
  cancelledAt?: string
  settlement?: { settledAt: string; sellerReceived: number; platformFee: number; autoSettled?: boolean }
  /** PAID: hạn người bán gửi hàng (48 giờ). SHIPPING: lúc đơn tự hoàn tất nếu người mua không xác nhận (7 ngày) */
  timer?: { dueAt?: string }
  createdAt: string
}

export interface BuyNowInput {
  toyId: string
  deliveryMethod: DeliveryMethod
  recipientName?: string
  recipientPhone?: string
  province?: string
  ward?: string
  street?: string
  notes?: string
}

export interface ShipInput {
  carrierName: string
  trackingCode?: string
  photos: PurchasePhoto[]
  note?: string
}

/** GET /purchase-orders/mine, /sold trả { items, total, page, limit } trong `data` */
interface OrderPage {
  items: PurchaseOrder[]
  total: number
  page: number
  limit: number
}

const toPaginated = (page: OrderPage): Paginated<PurchaseOrder> => {
  const totalPages = Math.max(1, Math.ceil(page.total / page.limit))
  return {
    items: page.items,
    pagination: {
      page: page.page,
      limit: page.limit,
      totalItems: page.total,
      totalPages,
      hasNextPage: page.page < totalPages,
      hasPrevPage: page.page > 1,
    },
  }
}

export type PurchaseRole = 'buyer' | 'seller'

export const purchaseApi = {
  quote: (toyId: string, deliveryMethod: DeliveryMethod) =>
    apiPost<PurchaseQuote>('/purchase-orders/quote', { toyId, deliveryMethod }),
  buyNow: (input: BuyNowInput) => apiPost<PurchaseOrder>('/purchase-orders/buy-now', input),
  list: async (role: PurchaseRole, page: number, limit: number) =>
    toPaginated(await apiGet<OrderPage>(`/purchase-orders/${role === 'buyer' ? 'mine' : 'sold'}`, { page, limit })),
  detail: (orderId: string) => apiGet<PurchaseOrder>(`/purchase-orders/${orderId}`),
  ship: (orderId: string, input: ShipInput) => apiPost<PurchaseOrder>(`/purchase-orders/${orderId}/ship`, input),
  receive: (orderId: string) => apiPost<PurchaseOrder>(`/purchase-orders/${orderId}/receive`, {}),
}

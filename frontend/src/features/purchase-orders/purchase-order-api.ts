import { apiGet, apiPost } from '../../services/http'

export interface PurchasePricingQuote {
  toyId: string
  title: string
  toyImage?: string
  sellerId: string
  sellerName?: string
  deliveryMethod: 'DELIVERY' | 'LOCAL_PICKUP'
  itemPrice: number
  shippingFee: number
  platformFee: number
  totalPayable: number
  sellerNet: number
}

export interface CreateBuyNowPayload {
  toyId: string
  deliveryMethod: 'DELIVERY' | 'LOCAL_PICKUP'
  recipientName?: string
  recipientPhone?: string
  province?: string
  district?: string
  ward?: string
  street?: string
  notes?: string
}

export interface PurchaseOrderRecord {
  id: string
  code: string
  buyerId: string
  sellerId: string
  toyId: string
  itemDetails: {
    title: string
    condition?: string
    image?: string
  }
  deliveryMethod: string
  deliveryInfo?: {
    recipientName: string
    recipientPhone: string
    province?: string
    district?: string
    ward?: string
    street?: string
    notes?: string
  }
  pricing: {
    itemPrice: number
    shippingFee: number
    platformFee: number
    totalPayable: number
    sellerNet: number
  }
  status: string
  paidAt?: string
  createdAt: string
}

export const quotePurchasePricing = (payload: {
  toyId: string
  deliveryMethod: 'DELIVERY' | 'LOCAL_PICKUP'
  province?: string
}): Promise<PurchasePricingQuote> =>
  apiPost<PurchasePricingQuote>('/purchase-orders/quote', payload)

export const buyNow = (payload: CreateBuyNowPayload): Promise<PurchaseOrderRecord> =>
  apiPost<PurchaseOrderRecord>('/purchase-orders/buy-now', payload)

export const getMyPurchases = (params?: { page?: number; limit?: number }) =>
  apiGet<{ items: PurchaseOrderRecord[]; total: number; page: number; limit: number }>(
    '/purchase-orders/mine',
    params,
  )

export const getPurchaseDetail = (orderId: string): Promise<PurchaseOrderRecord> =>
  apiGet<PurchaseOrderRecord>(`/purchase-orders/${orderId}`)

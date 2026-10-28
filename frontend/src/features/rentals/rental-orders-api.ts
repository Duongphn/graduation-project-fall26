import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { useApiMutation } from '../../hooks/useApiMutation'
import { apiGet, apiPost } from '../../services/http'
import type { RentalPricing } from '../toy-catalog/rental-request-api'

/** GET /rentals, GET /rentals/:id, /history, POST /:id/accept, /:id/reject (UC07) — server/docs/api/rentals.md */

export const RENTAL_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PAID',
  'SHIPPING',
  'IN_USE',
  'RETURNING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTING',
] as const
export type RentalStatus = (typeof RENTAL_STATUSES)[number]

export type RentalTimerKind =
  | 'OWNER_RESPONSE'
  | 'PAYMENT'
  | 'RECEIPT_CONFIRM'
  | 'RETURN_REMINDER'
  | 'OVERDUE'
  | 'SETTLEMENT'

export interface RentalOrder {
  id: string
  code: string
  toyId: string
  renterId: string
  ownerId: string
  /** YYYY-MM-DD, cả ngày nhận và ngày trả đều tính */
  period: { startDate: string; endDate: string }
  pricing: RentalPricing
  status: RentalStatus
  timer?: { kind: RentalTimerKind; dueAt: string }
  rejectionReason?: string
}

/** Chi tiết đơn: khi người xem là chủ đồ, server kèm thông tin người thuê */
export interface RentalOrderDetail extends RentalOrder {
  renter?: {
    fullName: string
    avatar?: string
    trustScore?: number
    verified: boolean
  }
}

export interface RentalHistoryEntry {
  oldStatus?: RentalStatus
  newStatus: RentalStatus
  changedBy: string
  notes?: string
  occurredAt: string
}

export interface RentalListFilters {
  status?: RentalStatus
  page: number
}

interface RentalListPage {
  items: RentalOrder[]
  total: number
  page: number
  limit: number
}

export const RENTAL_REQUESTS_PAGE_SIZE = 10

export const rentalKeys = {
  all: ['rentals'] as const,
  ownerList: (filters: RentalListFilters) => ['rentals', 'owner', filters] as const,
  detail: (orderId: string) => ['rentals', 'detail', orderId] as const,
  history: (orderId: string) => ['rentals', 'history', orderId] as const,
}

export const ownerRentalsQuery = (filters: RentalListFilters) =>
  queryOptions({
    queryKey: rentalKeys.ownerList(filters),
    queryFn: () =>
      apiGet<RentalListPage>('/rentals', {
        role: 'owner',
        status: filters.status,
        page: filters.page,
        limit: RENTAL_REQUESTS_PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  })

export const rentalDetailQuery = (orderId: string) =>
  queryOptions({
    queryKey: rentalKeys.detail(orderId),
    queryFn: () => apiGet<RentalOrderDetail>(`/rentals/${orderId}`),
    staleTime: 15_000,
    retry: false,
  })

export const rentalHistoryQuery = (orderId: string) =>
  queryOptions({
    queryKey: rentalKeys.history(orderId),
    queryFn: () => apiGet<RentalHistoryEntry[]>(`/rentals/${orderId}/history`),
    staleTime: 15_000,
    retry: false,
  })

/** Chấp nhận / từ chối: sau đó tải lại đơn, lịch sử, danh sách và lịch trống của món đồ */
export const useOwnerRentalDecision = (orderId: string, toyId: string | undefined) => {
  const invalidate = [rentalKeys.all, ...(toyId ? [['toy-availability', toyId]] : [])]

  const accept = useApiMutation({
    mutationFn: () => apiPost<RentalOrder>(`/rentals/${orderId}/accept`),
    successMessage: 'Đã chấp nhận yêu cầu thuê. Người thuê có thời hạn để thanh toán.',
    invalidate,
    invalidateOnConflict: true,
  })

  const reject = useApiMutation({
    mutationFn: (reason: string) => apiPost<RentalOrder>(`/rentals/${orderId}/reject`, { reason }),
    successMessage: 'Đã từ chối yêu cầu thuê. Lịch của món đồ đã được mở lại.',
    invalidate,
    invalidateOnConflict: true,
  })

  return { accept, reject }
}

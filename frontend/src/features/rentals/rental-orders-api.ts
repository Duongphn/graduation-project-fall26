import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { useApiMutation } from '../../hooks/useApiMutation'
import { ApiError } from '../../services/api-error'
import { apiGet, apiPost, apiPostForm } from '../../services/http'
import type { RentalPricing } from '../toy-catalog/rental-request-api'
import type { ToyImage } from '../toy-listings/toy-listing-api'

/**
 * GET /rentals, GET /rentals/:id, /history, POST /:id/accept, /:id/reject (UC07), POST /:id/pay (UC08),
 * POST /:id/ship, /:id/receive (UC09) và GET /wallets/me — server/docs/api/rentals.md, wallets.md
 */

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
  /** Có từ khi chủ đồ giao: ảnh tình trạng hai phía và thời điểm giao/nhận */
  handover?: {
    ownerPhotos: ToyImage[]
    shippedAt?: string
    renterPhotos: ToyImage[]
    receivedAt?: string
    /** true khi hết hạn xác nhận và hệ thống tự chuyển sang Đang thuê */
    autoConfirmed?: boolean
  }
  /** Mốc bắt đầu tính thời gian thuê (lúc người thuê xác nhận đã nhận) */
  rentalStartedAt?: string
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

export type RentalRole = 'owner' | 'renter'

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
  list: (role: RentalRole, filters: RentalListFilters) => ['rentals', role, filters] as const,
  detail: (orderId: string) => ['rentals', 'detail', orderId] as const,
  history: (orderId: string) => ['rentals', 'history', orderId] as const,
}

export const rentalListQuery = (role: RentalRole, filters: RentalListFilters) =>
  queryOptions({
    queryKey: rentalKeys.list(role, filters),
    queryFn: () =>
      apiGet<RentalListPage>('/rentals', {
        role,
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

/** Bước bàn giao: chủ đồ gửi (PAID → SHIPPING) hoặc người thuê nhận (SHIPPING → IN_USE) */
export type HandoverStep = 'ship' | 'receive'

const HANDOVER_SUCCESS: Record<HandoverStep, string> = {
  ship: 'Đã xác nhận giao đồ chơi. Người thuê sẽ được báo để kiểm tra và xác nhận.',
  receive: 'Đã xác nhận nhận đồ chơi. Thời gian thuê bắt đầu tính từ bây giờ.',
}

/** Gửi ảnh tình trạng (multipart, trường `photos`, 1–10 ảnh) kèm xác nhận giao/nhận */
export const useRentalHandover = (orderId: string, step: HandoverStep, onSuccess?: () => void) =>
  useApiMutation({
    mutationFn: (photos: File[]) => {
      const form = new FormData()
      photos.forEach((file) => form.append('photos', file))
      return apiPostForm<RentalOrder>(`/rentals/${orderId}/${step}`, form)
    },
    successMessage: HANDOVER_SUCCESS[step],
    invalidate: [rentalKeys.all],
    invalidateOnConflict: true,
    onSuccess,
  })

/** Số dư ví của người đang đăng nhập (GET /wallets/me) */
export interface WalletSummary {
  balance: number
  currency: string
}

export const walletKeys = { me: ['wallet', 'me'] as const }

export const myWalletQuery = queryOptions({
  queryKey: walletKeys.me,
  queryFn: () => apiGet<WalletSummary>('/wallets/me'),
  staleTime: 10_000,
  retry: false,
})

/** details của lỗi 409 INSUFFICIENT_BALANCE khi thanh toán */
export interface InsufficientBalance {
  required: number
  balance: number
  shortfall: number
}

/**
 * Người thuê trả tiền thuê + cọc từ ví vào ký quỹ (POST /rentals/:id/pay). Ví không đủ tiền thì
 * không báo lỗi chung mà trả số tiền còn thiếu để khung thanh toán gợi ý nạp ví.
 */
export const useRentalPayment = (orderId: string, onInsufficient: (details: InsufficientBalance) => void) =>
  useApiMutation({
    mutationFn: () => apiPost<RentalOrder>(`/rentals/${orderId}/pay`),
    successMessage: 'Đã thanh toán. Tiền thuê và tiền cọc đang được giữ trong ví ký quỹ ToyFlow.',
    invalidate: [rentalKeys.all, walletKeys.me],
    invalidateOnConflict: true,
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'INSUFFICIENT_BALANCE') {
        onInsufficient(error.details as InsufficientBalance)
        return true
      }
      return false
    },
  })

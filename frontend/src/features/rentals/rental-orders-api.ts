import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { useApiMutation } from '../../hooks/useApiMutation'
import { ApiError } from '../../services/api-error'
import { apiGet, apiPost, apiPostForm } from '../../services/http'
import type { RentalPricing } from '../toy-catalog/rental-request-api'
import type { ToyImage } from '../toy-listings/toy-listing-api'

/**
 * GET /rentals, GET /rentals/:id, /history, POST /:id/accept, /:id/reject (UC07), POST /:id/pay (UC08),
 * POST /:id/ship, /:id/receive (UC09), POST /:id/return (UC10), POST /:id/settle (UC11) và GET /wallets/me — server/docs/api/rentals.md, wallets.md
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
  /** Có từ khi người thuê gửi trả: ảnh, ghi chú và phí trả trễ server đã chốt (trừ vào cọc) */
  returnInfo?: {
    photos: ToyImage[]
    note?: string
    requestedAt: string
    lateDays: number
    lateFee: number
  }
  /** Kết quả chủ đồ kiểm tra đồ trả: GOOD → Hoàn tất, DAMAGED → Đang khiếu nại (cọc giữ nguyên) */
  settlement?: {
    result: SettlementResult
    evidencePhotos?: ToyImage[]
    description?: string
    settledAt: string
    /** true khi hết hạn kiểm tra mà chủ đồ chưa báo, hệ thống tự quyết toán là Tốt */
    autoSettled?: boolean
    disputeId?: string
  }
  /** Có khi đơn đã có khiếu nại (người thuê hoặc chủ đồ mở) */
  disputeId?: string
}

export type SettlementResult = 'GOOD' | 'DAMAGED'

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

/** Ghi chú khi trả đồ: không bắt buộc, tối đa 500 ký tự như server */
export const RETURN_NOTE_MAX = 500

/** Người thuê gửi trả (IN_USE → RETURNING): 1–10 ảnh tình trạng + ghi chú; server tính phí trả trễ */
export const useRentalReturn = (orderId: string) =>
  useApiMutation({
    mutationFn: ({ photos, note }: { photos: File[]; note: string }) => {
      const form = new FormData()
      photos.forEach((file) => form.append('photos', file))
      if (note.trim()) form.append('note', note.trim())
      return apiPostForm<RentalOrder>(`/rentals/${orderId}/return`, form)
    },
    successMessage: 'Đã gửi yêu cầu trả đồ. Chủ đồ sẽ kiểm tra tình trạng rồi quyết toán tiền cọc.',
    invalidate: [rentalKeys.all],
    invalidateOnConflict: true,
  })

/**
 * Chủ đồ xác nhận đồ trả về còn tốt (RETURNING → COMPLETED): tiền thuê vào ví chủ đồ, cọc hoàn cho người
 * thuê. Báo hư hỏng đi qua khiếu nại (useOpenRentalDispute) để chọn được lý do.
 */
export const useRentalSettle = (orderId: string) =>
  useApiMutation({
    mutationFn: () => apiPost<RentalOrder>(`/rentals/${orderId}/settle`, { result: 'GOOD' }),
    successMessage: 'Đã quyết toán. Tiền thuê đã vào ví của bạn, tiền cọc được hoàn cho người thuê.',
    invalidate: [rentalKeys.all, walletKeys.me],
    invalidateOnConflict: true,
  })

/** Lý do khiếu nại server nhận, theo vai người gửi */
export type ComplaintRole = 'renter' | 'owner'
export const COMPLAINT_REASONS = {
  renter: ['DAMAGED_ON_RECEIPT', 'MISSING_PARTS', 'NOT_AS_DESCRIBED', 'OTHER'],
  owner: ['DAMAGED_ON_RETURN', 'MISSING_PARTS', 'OTHER'],
} as const satisfies Record<ComplaintRole, readonly string[]>
export type ComplaintReason = (typeof COMPLAINT_REASONS)[ComplaintRole][number]

/** Mô tả khiếu nại: 10–1000 ký tự như server */
export const COMPLAINT_DESCRIPTION_MIN = 10
export const COMPLAINT_DESCRIPTION_MAX = 1000

/**
 * Người thuê khiếu nại trong 24 giờ kể từ lúc xác nhận nhận đồ (renterComplaintHours của server).
 * Server là bên quyết định cuối: hết hạn thì trả COMPLAINT_WINDOW_CLOSED.
 */
export const RENTER_COMPLAINT_HOURS = 24

export interface OpenComplaintInput {
  reason: ComplaintReason
  description: string
  photos: File[]
}

/**
 * Gửi khiếu nại (POST /rentals/:id/disputes, multipart): đơn chuyển sang Đang khiếu nại, tiền thuê và cọc
 * nằm nguyên trong ví ký quỹ đến khi quản trị viên phán quyết. Mỗi đơn chỉ có một khiếu nại.
 */
export const useOpenRentalDispute = (orderId: string) =>
  useApiMutation({
    mutationFn: ({ reason, description, photos }: OpenComplaintInput) => {
      const form = new FormData()
      form.append('reason', reason)
      form.append('description', description.trim())
      photos.forEach((file) => form.append('photos', file))
      return apiPostForm<unknown>(`/rentals/${orderId}/disputes`, form)
    },
    successMessage: 'Đã gửi khiếu nại. Tiền thuê và tiền cọc được ToyFlow giữ cho đến khi có phán quyết.',
    invalidate: [rentalKeys.all, walletKeys.me],
    invalidateOnConflict: true,
  })

/** open: chờ bên bị khiếu nại phản hồi; under_review: quản trị viên xem xét; resolved/closed: đã xong */
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'closed'
export type DisputeVerdict = 'CLAIMANT_FAVORED' | 'RESPONDENT_FAVORED' | 'PARTIAL'

/** Khiếu nại như một bên của đơn thấy (GET /disputes/:id) */
export interface RentalDispute {
  id: string
  code: string
  orderId: string
  claimantId: string
  respondentId: string
  claimantRole: ComplaintRole
  reason: ComplaintReason
  description: string
  evidencePhotos: ToyImage[]
  status: DisputeStatus
  openedAt: string
  /** Hạn phản hồi 72 giờ; mất đi khi đã phản hồi hoặc đã chuyển sang xem xét */
  responseDueAt?: string
  response?: { message: string; photos: ToyImage[]; respondedAt: string }
  reviewStartedAt?: string
  /** true khi hết hạn mà bên bị khiếu nại không phản hồi */
  responseMissed?: boolean
  resolution?: {
    verdict: DisputeVerdict
    compensation: number
    reason: string
    resolvedAt: string
    payout: { renter: number; owner: number }
  }
}

export const disputeKeys = {
  detail: (disputeId: string) => ['disputes', disputeId] as const,
}

export const disputeQuery = (disputeId: string) =>
  queryOptions({
    queryKey: disputeKeys.detail(disputeId),
    queryFn: () => apiGet<RentalDispute>(`/disputes/${disputeId}`),
    staleTime: 15_000,
    retry: false,
  })

/** Phản hồi khiếu nại: 10–1000 ký tự như server, ảnh không bắt buộc (tối đa 10) */
export const RESPONSE_MESSAGE_MIN = 10
export const RESPONSE_MESSAGE_MAX = 1000

/**
 * Bên bị khiếu nại phản hồi một lần trong 72 giờ (POST /disputes/:id/response, multipart `message`,
 * `photos`): khiếu nại chuyển sang Đang xem xét và quản trị viên được báo.
 */
export const useRespondDispute = (disputeId: string) =>
  useApiMutation({
    mutationFn: ({ message, photos }: { message: string; photos: File[] }) => {
      const form = new FormData()
      form.append('message', message.trim())
      photos.forEach((file) => form.append('photos', file))
      return apiPostForm<RentalDispute>(`/disputes/${disputeId}/response`, form)
    },
    successMessage: 'Đã gửi phản hồi. Quản trị viên ToyFlow sẽ xem xét ảnh và giải thích của cả hai bên.',
    invalidate: [disputeKeys.detail(disputeId), rentalKeys.all],
    invalidateOnConflict: true,
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

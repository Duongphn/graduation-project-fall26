import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { useApiMutation } from '../../hooks/useApiMutation'
import { ApiError } from '../../services/api-error'
import { apiGet, apiPost, apiPostForm } from '../../services/http'
import type { RentalPricing } from '../toy-catalog/rental-request-api'
import type { ToyImage } from '../toy-listings/toy-listing-api'

/**
 * GET /rentals, GET /rentals/:id, POST /:id/accept, /:id/reject (UC07), POST /:id/pay (UC08),
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
}

export type SettlementResult = 'GOOD' | 'DAMAGED'

/** Hồ sơ một bên của đơn (người thuê hoặc chủ đồ) */
export interface RentalParty {
  id?: string
  fullName: string
  avatar?: string
  trustScore?: number
  verified: boolean
  role?: 'renter' | 'owner'
}

/** Tóm tắt đồ chơi server gắn kèm đơn (tin đã ẩn/xoá thì không có) */
export interface RentalToySummary {
  id: string
  name: string
  slug: string
  primaryImage?: string
  dailyRate: number
  depositAmount: number
}

/** Một mốc trong lịch sử đơn; changedBy.isSystem khi hệ thống tự chuyển (hết hạn, tự xác nhận…) */
export interface RentalTimelineEntry {
  oldStatus?: RentalStatus | null
  newStatus: RentalStatus
  changedBy: { id: string | null; name: string; role: string; isSystem: boolean }
  notes?: string
  occurredAt: string
}

export interface RenterFinancialItems {
  rentalFee: number
  depositPaid: number
  lateFee: number
  depositRefunded: number
  totalActualCost: number
}

export interface OwnerFinancialItems {
  grossRentalFee: number
  platformFeeRate: number
  platformFee: number
  lateCompensation: number
  netEarnings: number
}

interface FinancialSummary {
  status: string
  description: string
}

export interface RenterFinancialBreakdown {
  role: 'renter'
  currency: string
  /** true khi đơn chưa kết thúc: số tiền có thể còn đổi (phí trễ, quyết toán) */
  isEstimated: boolean
  settlementStatus: string
  items: RenterFinancialItems
  summary: FinancialSummary
}

export interface OwnerFinancialBreakdown {
  role: 'owner'
  currency: string
  isEstimated: boolean
  payoutStatus: string
  items: OwnerFinancialItems
  summary: FinancialSummary
}

export interface AdminFinancialBreakdown {
  role: 'admin'
  currency: string
  isEstimated: boolean
  items: RenterFinancialItems &
    OwnerFinancialItems & { escrowBalance?: number; platformRevenue?: number }
  renter?: RenterFinancialBreakdown
  owner?: OwnerFinancialBreakdown
  platformRevenue?: number
  summary: FinancialSummary
}

export type RentalFinancialBreakdown = RenterFinancialBreakdown | OwnerFinancialBreakdown | AdminFinancialBreakdown

/**
 * Chi tiết đơn (GET /rentals/:id): kèm hồ sơ hai bên, đồ chơi, lịch sử có tên người thao tác và bảng
 * chia tiền theo vai người xem. Người thuê không nhận phí nền tảng trong pricing.
 */
export interface RentalOrderDetail extends RentalOrder {
  renter?: RentalParty
  owner?: RentalParty
  toy?: RentalToySummary
  timeline?: RentalTimelineEntry[]
  financialBreakdown?: RentalFinancialBreakdown
}

/** Vai người xem trên danh sách; `all` chỉ dành cho quản trị viên */
export type RentalRole = 'owner' | 'renter'
export type RentalListRole = RentalRole | 'all'

/** Nhóm trạng thái server hiểu (STATUS_GROUP_MAP) */
export const RENTAL_GROUPS = ['all', 'pending', 'active', 'completed', 'cancelled', 'disputed'] as const
export type RentalGroup = (typeof RENTAL_GROUPS)[number]

/** Một dòng của GET /rentals: không có toyId mà có sẵn tóm tắt đồ chơi và bên còn lại */
export interface RentalOrderItem {
  id: string
  code: string
  role: 'renter' | 'owner' | 'admin'
  status: RentalStatus
  period: { startDate: string; endDate: string }
  pricing: Pick<RentalPricing, 'days' | 'dailyRate' | 'rentalFee' | 'depositAmount' | 'totalPayable'> &
    Partial<Pick<RentalPricing, 'platformFee' | 'platformFeeRate'>>
  toy?: RentalToySummary
  counterpart?: RentalParty
  /** Chỉ có khi quản trị viên xem đơn mình không tham gia */
  renter?: RentalParty
  owner?: RentalParty
  timer?: { kind: RentalTimerKind; dueAt: string }
  createdAt: string
}

export interface RentalListFilters {
  group: RentalGroup
  page: number
}

interface RentalListPage {
  items: RentalOrderItem[]
  total: number
  page: number
  limit: number
}

export const RENTAL_REQUESTS_PAGE_SIZE = 10

export const rentalKeys = {
  all: ['rentals'] as const,
  list: (role: RentalListRole, filters: RentalListFilters) => ['rentals', role, filters] as const,
  detail: (orderId: string) => ['rentals', 'detail', orderId] as const,
}

export const rentalListQuery = (role: RentalListRole, filters: RentalListFilters) =>
  queryOptions({
    queryKey: rentalKeys.list(role, filters),
    queryFn: () =>
      apiGet<RentalListPage>('/rentals', {
        role,
        group: filters.group === 'all' ? undefined : filters.group,
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

/** Mô tả hư hỏng: 10–1000 ký tự như server */
export const DAMAGE_DESCRIPTION_MIN = 10
export const DAMAGE_DESCRIPTION_MAX = 1000

export type SettleInput = { result: 'GOOD' } | { result: 'DAMAGED'; photos: File[]; description: string }

const SETTLE_SUCCESS: Record<SettlementResult, string> = {
  GOOD: 'Đã quyết toán. Tiền thuê đã vào ví của bạn, tiền cọc được hoàn cho người thuê.',
  DAMAGED: 'Đã báo hư hỏng và mở khiếu nại. Tiền cọc được giữ nguyên cho đến khi ToyFlow giải quyết.',
}

/**
 * Chủ đồ quyết toán đơn đang trả (RETURNING): GOOD gửi JSON; DAMAGED gửi multipart với 1–10 ảnh bằng
 * chứng (`photos`) và mô tả. Sau đó tải lại đơn và ví (tiền thuê vừa vào ví khi GOOD).
 */
export const useRentalSettle = (orderId: string) =>
  useApiMutation({
    mutationFn: (input: SettleInput) => {
      if (input.result === 'GOOD') return apiPost<RentalOrder>(`/rentals/${orderId}/settle`, { result: 'GOOD' })
      const form = new FormData()
      form.append('result', 'DAMAGED')
      form.append('description', input.description.trim())
      input.photos.forEach((file) => form.append('photos', file))
      return apiPostForm<RentalOrder>(`/rentals/${orderId}/settle`, form)
    },
    successMessage: (_data, input) => SETTLE_SUCCESS[input.result],
    invalidate: [rentalKeys.all, walletKeys.me],
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

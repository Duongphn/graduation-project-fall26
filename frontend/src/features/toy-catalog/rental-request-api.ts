import { queryOptions } from '@tanstack/react-query'
import { useApiMutation } from '../../hooks/useApiMutation'
import { apiPost } from '../../services/http'

/** POST /rentals/quote, POST /rentals (UC06) — xem server/docs/api/rentals.md */

export interface RentalPeriodInput {
  toyId: string
  /** YYYY-MM-DD, ngày nhận và ngày trả đều tính (khoảng đóng) */
  startDate: string
  endDate: string
}

export interface DateRange {
  startDate: string
  endDate: string
}

/**
 * Giá chốt bởi server. `totalPayable` = tiền thuê + cọc: phí nền tảng không thu thêm của người thuê
 * mà trừ vào phần tiền thuê chủ đồ nhận khi quyết toán.
 */
export interface RentalPricing {
  days: number
  dailyRate: number
  rentalFee: number
  depositAmount: number
  platformFeeRate: number
  platformFee: number
  totalPayable: number
}

export interface RentalQuote {
  available: boolean
  pricing: RentalPricing
  conflicts: DateRange[]
}

export interface CreatedRentalOrder {
  id: string
  code: string
  status: string
  period: DateRange
  pricing: RentalPricing
  /** Hạn chủ đồ phản hồi (timer OWNER_RESPONSE) */
  timer?: { kind: string; dueAt: string }
}

/** details của lỗi 409 RENTAL_DATES_UNAVAILABLE khi tạo đơn */
export interface DatesUnavailableDetails {
  conflicts: DateRange[]
  suggestion: DateRange | null
}

export const rentalRequestApi = {
  quote: (input: RentalPeriodInput) => apiPost<RentalQuote>('/rentals/quote', input),
  create: (input: RentalPeriodInput) => apiPost<CreatedRentalOrder>('/rentals', input),
}

export const rentalQuoteQuery = (input: RentalPeriodInput) =>
  queryOptions({
    queryKey: ['rental-quote', input.toyId, input.startDate, input.endDate],
    queryFn: () => rentalRequestApi.quote(input),
    staleTime: 30_000,
    retry: false,
  })

interface CreateRentalCallbacks {
  onCreated: (order: CreatedRentalOrder) => void
  /** Trả true khi lỗi đã được hiển thị trên thẻ */
  onFailed: (error: unknown) => boolean
}

export const useCreateRental = (toyId: string, { onCreated, onFailed }: CreateRentalCallbacks) =>
  useApiMutation({
    mutationFn: rentalRequestApi.create,
    successMessage: 'Đã gửi yêu cầu thuê. Chủ đồ sẽ phản hồi sớm.',
    // Đơn mới giữ lịch ngay: tải lại lịch trống để khoảng vừa đặt hiện là đã có người thuê
    invalidate: [['toy-availability', toyId], ['rental-quote', toyId]],
    invalidateOnConflict: true,
    onSuccess: onCreated,
    onError: onFailed,
  })

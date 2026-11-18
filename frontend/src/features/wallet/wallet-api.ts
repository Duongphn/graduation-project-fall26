import { apiGet, apiGetPage, apiPost } from '../../services/http'
import type { Paginated } from '../../types/api'

/**
 * GET /wallets/me, GET /wallets/me/transactions — server/docs/api/wallets.md
 * POST /payments/vnpay/topup, GET /payments/vnpay/return (UC17) — server/docs/api/payments.md
 * POST /wallets/withdrawals, GET /wallets/withdrawals (UC18)
 */

export interface WalletHoldings {
  /** Tiền thuê + tiền cọc của các đơn đã thanh toán, chưa quyết toán (đang ở tài khoản ký quỹ) */
  rentals: number
}

export interface WalletSummary {
  /** Bằng availableBalance (giữ cho code cũ) */
  balance: number
  /** Dùng được ngay */
  availableBalance: number
  /** Đã rời số dư nhưng vẫn là tiền của bạn: tổng các khoản trong `holdings` */
  holdingBalance: number
  /** Chi tiết khoản tạm giữ (không phải backend nào cũng trả) */
  holdings?: WalletHoldings
  currency: string
}

/** Nhóm "Loại" trên màn hình lịch sử, khớp `type` của API */
export const walletTransactionTypes = ['rental', 'topup', 'withdrawal', 'admin_credit'] as const
export type WalletTransactionType = (typeof walletTransactionTypes)[number]

export const walletTransactionDirections = ['credit', 'debit'] as const
export type WalletTransactionDirection = (typeof walletTransactionDirections)[number]

export interface WalletTransaction {
  id: string
  amount: number
  /** credit: tiền vào ví, debit: tiền ra khỏi ví */
  type: WalletTransactionDirection
  description?: string
  reference?: { kind: 'rental_order' | 'admin_credit' | 'topup' | 'withdrawal'; id: string }
  createdAt: string
}

export interface WalletTransactionParams {
  page: number
  limit: number
  type?: WalletTransactionType
  direction?: WalletTransactionDirection
}

/** Hạn mức một lần nạp qua VNPay (khớp backend) */
export const TOPUP_MIN_AMOUNT = 10_000
export const TOPUP_MAX_AMOUNT = 50_000_000

/** POST /payments/vnpay/topup: giao dịch Pending và link sang cổng VNPay */
export interface TopupCreated {
  paymentCode: string
  paymentUrl: string
  amount: number
  expiresAt: string
}

export type TopupStatus = 'pending' | 'success' | 'failed'

/** GET /payments/vnpay/return: kết quả giao dịch sau khi VNPay chuyển về */
export interface TopupResult {
  paymentCode: string
  amount: number
  status: TopupStatus
  /** Người dùng bấm Hủy trên VNPay (status vẫn là failed) */
  cancelled: boolean
  /** Số dư ví sau khi xử lý */
  balance: number
}

/** Hạn mức một lệnh rút (khớp WITHDRAWAL_LIMITS ở backend) */
export const WITHDRAWAL_MIN_AMOUNT = 50_000
export const WITHDRAWAL_MAX_AMOUNT = 20_000_000

export interface BankInfo {
  bankName: string
  accountNumber: string
  /** In hoa, không dấu (server cũng tự in hoa) */
  accountHolderName: string
}

/** pending: đang chờ, tiền đã tạm trừ · approved: đã duyệt · completed: đã chuyển khoản · rejected: bị từ chối, tiền hoàn về ví */
export type WithdrawalStatus = 'pending' | 'approved' | 'completed' | 'rejected'

export interface WithdrawalRequest {
  id: string
  code?: string
  amount: number
  bankInfo: BankInfo
  status: WithdrawalStatus
  /** Ghi chú của Admin, vd. lý do từ chối */
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface CreateWithdrawalInput {
  amount: number
  bankInfo: BankInfo
}

/** GET /wallets/withdrawals trả danh sách trong `data` (không dùng envelope `pagination`) */
export interface WithdrawalPage {
  items: WithdrawalRequest[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasNextPage?: boolean
}

export const walletApi = {
  // limit=1: màn hình chỉ cần số dư, lịch sử lấy ở /wallets/me/transactions
  me: () => apiGet<WalletSummary>('/wallets/me', { limit: 1 }),
  transactions: (params: WalletTransactionParams): Promise<Paginated<WalletTransaction>> =>
    apiGetPage<WalletTransaction>('/wallets/me/transactions', params),
  createTopup: (amount: number) => apiPost<TopupCreated>('/payments/vnpay/topup', { amount }),
  /**
   * Gửi nguyên query VNPay trả về (`?vnp_Amount=…&vnp_SecureHash=…`) cho server kiểm tra chữ ký.
   * Giữ chuỗi gốc, không parse rồi ghép lại, để giá trị không bị mã hoá khác đi.
   */
  confirmVnpayReturn: (search: string) => apiGet<TopupResult>(`/payments/vnpay/return${search}`),
  /** UC18: tạo lệnh rút Pending, server tạm trừ số tiền khỏi số dư khả dụng */
  createWithdrawal: (input: CreateWithdrawalInput) => apiPost<WithdrawalRequest>('/wallets/withdrawals', input),
  myWithdrawals: (params: { page: number; limit: number }) => apiGet<WithdrawalPage>('/wallets/withdrawals', params),
}

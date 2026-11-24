import { apiGet, apiPost } from '../../services/http'
import type { Paginated } from '../../types/api'

/**
 * API ví theo backend của lead (nhánh wallet-*):
 * - GET /wallets/me, GET /wallets/me/transactions
 * - POST /payments/topup/payos, GET /payments/payos/:code, POST /payments/payos/:code/cancel,
 *   GET /payments/payos-return (UC17, chuyển khoản VietQR qua PayOS)
 * - POST /wallets/withdrawals, GET /wallets/withdrawals (UC18)
 */

export interface WalletSummary {
  /** Bằng availableBalance (giữ cho code cũ) */
  balance: number
  /** Dùng được ngay */
  availableBalance: number
  /** Đã rời số dư nhưng vẫn là tiền của bạn: tiền thuê + cọc chưa quyết toán, lệnh rút đang chờ */
  holdingBalance: number
  currency: string
}

/** Nhóm "Loại" trên màn hình lịch sử */
export const walletTransactionTypes = ['rental', 'purchase', 'topup', 'withdrawal', 'admin_credit'] as const
export type WalletTransactionType = (typeof walletTransactionTypes)[number]

/** Nhóm "Loại" → `reference.kind` mà backend ghi cho giao dịch đó (tham số `kind`) */
export const WALLET_TYPE_KINDS: Record<WalletTransactionType, string> = {
  rental: 'rental_order',
  purchase: 'purchase_order',
  topup: 'payment',
  withdrawal: 'withdrawal',
  admin_credit: 'admin_credit',
}

export const walletTransactionDirections = ['credit', 'debit'] as const
export type WalletTransactionDirection = (typeof walletTransactionDirections)[number]

export interface WalletTransaction {
  id: string
  amount: number
  /** credit: tiền vào ví, debit: tiền ra khỏi ví */
  type: WalletTransactionDirection
  description?: string
  /** kind: rental_order | payment (nạp qua PayOS) | withdrawal | admin_credit | adjustment… */
  reference?: { kind?: string; id?: string }
  createdAt: string
}

/** Tham số của GET /wallets/me/transactions: `type` là chiều tiền, `kind` là loại giao dịch */
export interface WalletTransactionParams {
  page: number
  limit: number
  type?: WalletTransactionDirection
  kind?: string
}

/** GET /wallets/me/transactions và GET /wallets/withdrawals trả danh sách trong `data` */
interface ListPage<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasNextPage?: boolean
  hasPrevPage?: boolean
}

/** Đổi danh sách của backend về dạng Paginated dùng chung của frontend */
export const toPaginated = <T,>(page: ListPage<T>): Paginated<T> => ({
  items: page.items,
  pagination: {
    page: page.page,
    limit: page.limit,
    totalItems: page.total,
    totalPages: page.totalPages,
    hasNextPage: page.hasNextPage ?? page.page < page.totalPages,
    hasPrevPage: page.hasPrevPage ?? page.page > 1,
  },
})

/** Hạn mức một lần nạp (khớp validateTopupInput ở backend) */
export const TOPUP_MIN_AMOUNT = 10_000
export const TOPUP_MAX_AMOUNT = 100_000_000

/**
 * POST /payments/topup/payos, GET /payments/payos/:code: thông tin chuyển khoản để ToyFlow tự hiện
 * mã VietQR (không phải rời sang trang PayOS)
 */
export interface PayosCheckout {
  paymentCode: string
  amount: number
  status: TopupStatus
  expiresAt: string
  /** Nội dung mã VietQR, app ngân hàng nào cũng quét được */
  qrCode: string
  /** Trang thanh toán của PayOS (dự phòng) */
  checkoutUrl: string
  /** Mã BIN NAPAS của ngân hàng nhận (970422 = MB…) */
  bankBin: string
  accountNumber: string
  accountName: string
  /** Nội dung chuyển khoản */
  description: string
}

/**
 * Kết quả GET /payments/payos-return và POST /payments/payos/:code/cancel. not_found: không có giao dịch,
 * cancelled: người dùng bấm Hủy, pending: tiền chưa về.
 */
export type TopupStatus = 'success' | 'failed' | 'cancelled' | 'pending' | 'not_found'

export interface TopupResult {
  success: boolean
  status: TopupStatus
  paymentCode?: string
  amount?: number
  /** Câu thông báo của server */
  message: string
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

export type WithdrawalPage = ListPage<WithdrawalRequest>

/** Backend để availableBalance / holdingBalance là tuỳ chọn: thiếu thì lấy balance / 0 */
type WalletResponse = Omit<WalletSummary, 'availableBalance' | 'holdingBalance'> &
  Partial<Pick<WalletSummary, 'availableBalance' | 'holdingBalance'>>

export const toWalletSummary = (wallet: WalletResponse): WalletSummary => ({
  ...wallet,
  availableBalance: wallet.availableBalance ?? wallet.balance,
  holdingBalance: wallet.holdingBalance ?? 0,
})

export const walletApi = {
  me: async () => toWalletSummary(await apiGet<WalletResponse>('/wallets/me')),
  transactions: async (params: WalletTransactionParams): Promise<Paginated<WalletTransaction>> =>
    toPaginated(await apiGet<ListPage<WalletTransaction>>('/wallets/me/transactions', params)),
  createPayosTopup: (amount: number) => apiPost<PayosCheckout>('/payments/topup/payos', { amount }),
  getPayosCheckout: (code: string) => apiGet<PayosCheckout>(`/payments/payos/${code}`),
  /** Huỷ link PayOS; nếu tiền đã về trong lúc đó, server vẫn cộng tiền và trả success */
  cancelPayosTopup: (code: string) => apiPost<TopupResult>(`/payments/payos/${code}/cancel`),
  /** Server hỏi PayOS trạng thái giao dịch `orderCode` rồi cộng tiền nếu đã thanh toán */
  confirmPayosReturn: (orderCode: string) => apiGet<TopupResult>('/payments/payos-return', { orderCode }),
  /** UC18: tạo lệnh rút Pending, server tạm trừ số tiền khỏi số dư khả dụng */
  createWithdrawal: (input: CreateWithdrawalInput) => apiPost<WithdrawalRequest>('/wallets/withdrawals', input),
  myWithdrawals: (params: { page: number; limit: number }) => apiGet<WithdrawalPage>('/wallets/withdrawals', params),
}

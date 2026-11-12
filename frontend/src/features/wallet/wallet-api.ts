import { apiGet, apiGetPage } from '../../services/http'
import type { Paginated } from '../../types/api'

/** GET /wallets/me, GET /wallets/me/transactions — server/docs/api/wallets.md */

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
  holdings: WalletHoldings
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

export const walletApi = {
  // limit=1: màn hình chỉ cần số dư, lịch sử lấy ở /wallets/me/transactions
  me: () => apiGet<WalletSummary>('/wallets/me', { limit: 1 }),
  transactions: (params: WalletTransactionParams): Promise<Paginated<WalletTransaction>> =>
    apiGetPage<WalletTransaction>('/wallets/me/transactions', params),
}

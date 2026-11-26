import type { WithdrawalStatus } from '../../constants/domain'
import type { PaginationParams } from '../../types/api'

// Responses of /wallets/admin/withdrawals (server/src/services/withdrawal.service.ts, lead's paths).

export interface AdminWithdrawal {
  id: string
  /** Mã lệnh, dùng làm nội dung chuyển khoản, vd. WD1763519600000123 */
  code?: string
  userId: string
  amount: number
  /** Đầy đủ số tài khoản: Admin cần để chuyển khoản */
  bankInfo: { bankName: string; accountNumber: string; accountHolderName: string }
  status: WithdrawalStatus
  /** Lý do khi từ chối */
  notes?: string
  processedAt?: string
  processedBy?: string
  createdAt: string
  updatedAt: string
  user: { id: string; fullName?: string; email?: string; phone?: string }
}

/** 'all' = không lọc */
export type WithdrawalFilterStatus = 'all' | WithdrawalStatus

export interface AdminWithdrawalListParams extends PaginationParams {
  status?: WithdrawalFilterStatus
}

export type WithdrawalCounts = Record<'pending' | 'completed' | 'rejected', number>

/** completed: Admin đã chuyển khoản; rejected: hoàn tiền vào ví, kèm lý do 5–500 ký tự */
export type ProcessWithdrawalInput = { status: 'completed' } | { status: 'rejected'; notes: string }

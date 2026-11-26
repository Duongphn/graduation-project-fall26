import { z } from 'zod'

import { formatVnd } from '../toy-listings/format-vnd'
import { DEFAULT_WITHDRAWAL_LIMITS, type WithdrawalLimits, type WithdrawalStatus } from './wallet-api'

/** Ngân hàng phổ biến cho ô chọn (server lưu tên dạng chuỗi) */
export const BANK_OPTIONS = [
  'Vietcombank',
  'VietinBank',
  'BIDV',
  'Agribank',
  'Techcombank',
  'MB Bank',
  'ACB',
  'VPBank',
  'TPBank',
  'Sacombank',
  'HDBank',
  'VIB',
  'SHB',
  'SeABank',
  'OCB',
  'MSB',
  'Eximbank',
  'LPBank',
  'Nam A Bank',
  'Bac A Bank',
] as const

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  pending: 'Đang chờ xử lý',
  approved: 'Đã duyệt, chờ chuyển khoản',
  completed: 'Đã chuyển khoản',
  rejected: 'Bị từ chối, đã hoàn tiền',
}

/** "Nguyễn Văn Ánh" → "NGUYEN VAN ANH": tên chủ tài khoản như in trên thẻ ngân hàng */
export const toAccountHolderName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z ]/g, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .toUpperCase()

/** "0123456789" → "•••• 6789" */
export const maskAccountNumber = (accountNumber: string) => `•••• ${accountNumber.slice(-4)}`

export interface WithdrawalFormValues {
  amount: number | undefined
  bankName: string
  accountNumber: string
  accountHolderName: string
}

/**
 * Kiểm tra trước khi gửi, khớp luật của backend; thêm điều kiện không vượt số dư khả dụng. Hạn mức
 * là giá trị Admin đang đặt (UC30), mặc định 50.000–20.000.000.
 */
export const withdrawalFormSchema = (
  availableBalance: number,
  limits: WithdrawalLimits = DEFAULT_WITHDRAWAL_LIMITS,
) =>
  z.object({
    amount: z
      .number({ error: 'Vui lòng nhập số tiền cần rút.' })
      .int('Số tiền rút phải là số nguyên.')
      .min(limits.minAmount, `Số tiền rút tối thiểu là ${formatVnd(limits.minAmount)}.`)
      .max(limits.maxAmount, `Số tiền rút tối đa mỗi lần là ${formatVnd(limits.maxAmount)}.`)
      .max(availableBalance, `Số dư khả dụng chỉ còn ${formatVnd(availableBalance)}.`),
    bankName: z.string().trim().min(2, 'Vui lòng chọn ngân hàng.'),
    accountNumber: z
      .string()
      .trim()
      .regex(/^[0-9]{6,25}$/, 'Số tài khoản chỉ gồm chữ số, từ 6 đến 25 số.'),
    accountHolderName: z
      .string()
      .trim()
      .min(2, 'Vui lòng nhập tên chủ tài khoản.')
      .max(100, 'Tên chủ tài khoản quá dài.'),
  })

export type WithdrawalFieldErrors = Partial<Record<keyof WithdrawalFormValues, string>>

/** Lỗi đầu tiên của từng ô; rỗng nếu hợp lệ */
export function validateWithdrawalForm(
  values: WithdrawalFormValues,
  availableBalance: number,
  limits: WithdrawalLimits = DEFAULT_WITHDRAWAL_LIMITS,
): WithdrawalFieldErrors {
  const result = withdrawalFormSchema(availableBalance, limits).safeParse(values)
  if (result.success) return {}
  const errors: WithdrawalFieldErrors = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof WithdrawalFormValues
    errors[field] ??= issue.message
  }
  return errors
}

/** Số tiền nút "Rút tối đa" điền vào: toàn bộ số dư khả dụng, không quá hạn mức một lần */
export const maxWithdrawableAmount = (
  availableBalance: number,
  limits: WithdrawalLimits = DEFAULT_WITHDRAWAL_LIMITS,
) => Math.min(availableBalance, limits.maxAmount)

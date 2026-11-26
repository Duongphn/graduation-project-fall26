import { formatVnd } from '../toy-listings/format-vnd'
import { TOPUP_MAX_AMOUNT, TOPUP_MIN_AMOUNT } from './wallet-api'

// Nạp qua trang mã VietQR rồi sang /wallet/topup/payos-result: nhớ trang cần quay lại (vd. đơn thuê
// đang chờ thanh toán) trong sessionStorage của tab này.

const RETURN_TO_KEY = 'toyflow.topup.returnTo'

/** Chỉ nhận đường dẫn nội bộ ("/rentals/mine/123"), không nhận "//evil.com" hay URL đầy đủ */
export const isSafeReturnPath = (path: string | null | undefined): path is string =>
  typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')

export function rememberTopupReturn(path: string | undefined) {
  try {
    if (isSafeReturnPath(path)) sessionStorage.setItem(RETURN_TO_KEY, path)
    else sessionStorage.removeItem(RETURN_TO_KEY)
  } catch {
    // Trình duyệt chặn storage: chỉ mất nút "Quay lại", nạp tiền vẫn chạy
  }
}

export function readTopupReturn(): string | undefined {
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY)
    return isSafeReturnPath(path) ? path : undefined
  } catch {
    return undefined
  }
}

export function clearTopupReturn() {
  try {
    sessionStorage.removeItem(RETURN_TO_KEY)
  } catch {
    // bỏ qua
  }
}

/** Lỗi của số tiền đang nhập, undefined nếu hợp lệ */
export function topupAmountError(amount: number | undefined): string | undefined {
  if (amount === undefined || amount === 0) return 'Vui lòng nhập số tiền cần nạp.'
  if (!Number.isInteger(amount)) return 'Số tiền phải là số nguyên.'
  if (amount < TOPUP_MIN_AMOUNT) return `Số tiền nạp tối thiểu là ${formatVnd(TOPUP_MIN_AMOUNT)}.`
  if (amount > TOPUP_MAX_AMOUNT) return `Số tiền nạp tối đa mỗi lần là ${formatVnd(TOPUP_MAX_AMOUNT)}.`
  return undefined
}

/** Số tiền gợi ý khi thiếu `shortfall`: làm tròn lên nghìn, không dưới mức nạp tối thiểu */
export const suggestedTopupAmount = (shortfall: number) =>
  Math.min(TOPUP_MAX_AMOUNT, Math.max(TOPUP_MIN_AMOUNT, Math.ceil(shortfall / 1000) * 1000))

/** Link mở hộp nạp tiền trên trang ví, điền sẵn số tiền và trang quay lại */
export function walletTopupLink(walletPath: string, amount: number, returnTo?: string) {
  const params = new URLSearchParams({ topup: String(amount) })
  if (isSafeReturnPath(returnTo)) params.set('returnTo', returnTo)
  return `${walletPath}?${params.toString()}`
}

/** Đọc ?topup=&returnTo= trên trang ví: undefined khi không yêu cầu mở hộp nạp tiền */
export function parseTopupRequest(searchParams: URLSearchParams) {
  if (!searchParams.has('topup')) return undefined
  const amount = Number(searchParams.get('topup'))
  const returnTo = searchParams.get('returnTo')
  return {
    amount:
      Number.isInteger(amount) && amount >= TOPUP_MIN_AMOUNT && amount <= TOPUP_MAX_AMOUNT ? amount : undefined,
    returnTo: isSafeReturnPath(returnTo) ? returnTo : undefined,
  }
}

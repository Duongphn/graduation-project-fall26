import {
  WALLET_TYPE_KINDS,
  walletTransactionTypes,
  type WalletTransaction,
  type WalletTransactionDirection,
  type WalletTransactionType,
} from './wallet-api'

/** Nhãn bộ lọc "Loại" trên màn hình lịch sử */
export const WALLET_TYPE_LABELS: Record<WalletTransactionType, string> = {
  rental: 'Thuê đồ chơi',
  topup: 'Nạp tiền',
  withdrawal: 'Rút tiền',
  admin_credit: 'ToyFlow cộng tiền',
}

export const WALLET_DIRECTION_LABELS: Record<WalletTransactionDirection, string> = {
  credit: 'Tiền vào',
  debit: 'Tiền ra',
}

/** Loại của một giao dịch (theo reference.kind); kind khác (vd. adjustment) thì undefined */
export const transactionTypeOf = (transaction: WalletTransaction): WalletTransactionType | undefined => {
  const kind = transaction.reference?.kind
  return walletTransactionTypes.find((type) => WALLET_TYPE_KINDS[type] === kind)
}

/** Dòng chính của một giao dịch: mô tả từ server, thiếu thì dùng nhãn loại */
export function transactionTitle(transaction: WalletTransaction): string {
  if (transaction.description) return transaction.description
  const type = transactionTypeOf(transaction)
  return type ? WALLET_TYPE_LABELS[type] : WALLET_DIRECTION_LABELS[transaction.type]
}

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** "2026-11-13T01:46:34Z" → "08:46 13/11/2026" (giờ máy người dùng) */
export const formatTransactionTime = (iso: string) => dateTimeFormatter.format(new Date(iso))

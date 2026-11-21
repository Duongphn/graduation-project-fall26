import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'

import { formatVnd } from '../../toy-listings/format-vnd'
import type { WalletTransaction } from '../wallet-api'
import { formatTransactionTime, transactionTitle, transactionTypeOf, WALLET_TYPE_LABELS } from '../wallet-display'

interface WalletTransactionListProps {
  transactions: WalletTransaction[]
}

/** Các dòng lịch sử ví: chiều tiền, mô tả, loại, thời gian và số tiền (+ vào, − ra) */
export function WalletTransactionList({ transactions }: WalletTransactionListProps) {
  return (
    <ul className="divide-y divide-tf-surface overflow-hidden rounded-xl border border-tf-surface bg-white">
      {transactions.map((transaction) => {
        const isCredit = transaction.type === 'credit'
        const type = transactionTypeOf(transaction)
        const Icon = isCredit ? ArrowDownLeft : ArrowUpRight
        return (
          <li key={transaction.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-full ${
                isCredit ? 'bg-emerald-50 text-emerald-700' : 'bg-tf-surface text-tf-ink-muted'
              }`}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-tf-ink">{transactionTitle(transaction)}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-tf-ink-muted">
                {type && <span>{WALLET_TYPE_LABELS[type]}</span>}
                <time dateTime={transaction.createdAt}>{formatTransactionTime(transaction.createdAt)}</time>
              </span>
            </span>
            <span
              className={`shrink-0 text-sm font-bold tabular-nums ${isCredit ? 'text-emerald-700' : 'text-tf-ink'}`}
              aria-label={`${isCredit ? 'Cộng' : 'Trừ'} ${formatVnd(transaction.amount)}`}
            >
              {isCredit ? '+' : '−'}
              {formatVnd(transaction.amount)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

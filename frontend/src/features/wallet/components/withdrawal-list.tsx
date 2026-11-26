import { formatVnd } from '../../toy-listings/format-vnd'
import type { WithdrawalRequest, WithdrawalStatus } from '../wallet-api'
import { formatTransactionTime } from '../wallet-display'
import { maskAccountNumber, WITHDRAWAL_STATUS_LABELS } from '../withdrawal-form'

const STATUS_TONES: Record<WithdrawalStatus, string> = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-sky-50 text-sky-800',
  completed: 'bg-emerald-50 text-emerald-800',
  rejected: 'bg-red-50 text-red-700',
}

/** Dòng giải thích bước tiếp theo / kết quả của một lệnh rút */
function outcomeOf(withdrawal: WithdrawalRequest): { text: string; tone: string } | undefined {
  const at = withdrawal.processedAt ? ` lúc ${formatTransactionTime(withdrawal.processedAt)}` : ''
  switch (withdrawal.status) {
    case 'pending':
      return { text: 'ToyFlow sẽ chuyển khoản sau khi duyệt; số tiền đang được tạm giữ.', tone: 'text-tf-ink-muted' }
    case 'completed':
      return { text: `Đã chuyển về tài khoản của bạn${at}.`, tone: 'text-emerald-700' }
    case 'rejected':
      return {
        text: `Đã hoàn ${formatVnd(withdrawal.amount)} vào ví${at}.${withdrawal.notes ? ` Lý do: ${withdrawal.notes}` : ''}`,
        tone: 'text-red-700',
      }
    default:
      return undefined
  }
}

/** Các lệnh rút gần nhất: số tiền, tài khoản nhận (che số), trạng thái và kết quả xử lý */
export function WithdrawalList({ withdrawals }: { withdrawals: WithdrawalRequest[] }) {
  return (
    <ul className="divide-y divide-tf-surface overflow-hidden rounded-xl border border-tf-surface bg-white">
      {withdrawals.map((withdrawal) => {
        const outcome = outcomeOf(withdrawal)
        return (
          <li key={withdrawal.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-tf-ink tabular-nums">{formatVnd(withdrawal.amount)}</span>
              <span className="block truncate text-xs text-tf-ink-muted">
                {withdrawal.bankInfo.bankName} · {maskAccountNumber(withdrawal.bankInfo.accountNumber)} ·{' '}
                <time dateTime={withdrawal.createdAt}>{formatTransactionTime(withdrawal.createdAt)}</time>
              </span>
              {outcome && <span className={`mt-0.5 block text-xs ${outcome.tone}`}>{outcome.text}</span>}
            </span>
            <span
              className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold sm:self-auto ${STATUS_TONES[withdrawal.status]}`}
            >
              {WITHDRAWAL_STATUS_LABELS[withdrawal.status]}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

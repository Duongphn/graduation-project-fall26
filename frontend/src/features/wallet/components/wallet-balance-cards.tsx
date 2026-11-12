import { Lock, Wallet } from 'lucide-react'

import { formatVnd } from '../../toy-listings/format-vnd'
import type { WalletSummary } from '../wallet-api'

interface WalletBalanceCardsProps {
  /** undefined khi đang tải */
  wallet: WalletSummary | undefined
}

const amountOrDots = (value: number | undefined) => (value === undefined ? '…' : formatVnd(value))

/** Hai thẻ số dư: khả dụng (dùng ngay) và đang tạm giữ (tiền thuê + cọc chưa quyết toán) */
export function WalletBalanceCards({ wallet }: WalletBalanceCardsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <section aria-labelledby="wallet-available" className="rounded-2xl bg-tf-primary p-5 text-white">
        <h2 id="wallet-available" className="flex items-center gap-2 text-sm font-semibold text-white/80">
          <Wallet className="size-4" aria-hidden /> Số dư khả dụng
        </h2>
        <p className="mt-2 text-3xl leading-tight font-bold tabular-nums">{amountOrDots(wallet?.availableBalance)}</p>
        <p className="mt-1 text-xs text-white/70">Dùng ngay để thanh toán đơn thuê, mua đồ chơi.</p>
      </section>

      <section aria-labelledby="wallet-holding" className="rounded-2xl border border-tf-surface bg-white p-5">
        <h2 id="wallet-holding" className="flex items-center gap-2 text-sm font-semibold text-tf-ink-muted">
          <Lock className="size-4" aria-hidden /> Đang tạm giữ
        </h2>
        <p className="mt-2 text-3xl leading-tight font-bold text-tf-ink tabular-nums">
          {amountOrDots(wallet?.holdingBalance)}
        </p>
        <p className="mt-1 text-xs text-tf-ink-muted">
          Tiền thuê và tiền cọc của các đơn đang thuê, ToyFlow giữ đến khi trả đồ và quyết toán.
        </p>
      </section>
    </div>
  )
}

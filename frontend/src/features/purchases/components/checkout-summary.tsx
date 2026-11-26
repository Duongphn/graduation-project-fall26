import { ShieldCheck, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { formatVnd } from '../../toy-listings/format-vnd'
import type { PurchaseQuote } from '../purchase-api'

interface CheckoutSummaryProps {
  quote: PurchaseQuote | undefined
  /** Số dư khả dụng; undefined khi đang tải */
  balance: number | undefined
  /** Link nạp đúng số còn thiếu (có trang quay lại) */
  topupHref: string
  children: ReactNode
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className={strong ? 'text-sm font-semibold text-tf-ink' : 'text-sm text-tf-ink-muted'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'text-lg font-bold text-tf-primary' : 'text-sm font-semibold text-tf-ink'}`}>
        {value}
      </dd>
    </div>
  )
}

/** Cột phải trang Mua ngay: món đồ, giá + phí giao, số dư ví và nút thanh toán (children) */
export function CheckoutSummary({ quote, balance, topupHref, children }: CheckoutSummaryProps) {
  const shortfall = quote && balance !== undefined ? Math.max(0, quote.totalPayable - balance) : 0

  return (
    <section
      aria-labelledby="checkout-summary-title"
      className="flex flex-col gap-4 rounded-2xl border border-tf-surface bg-white p-5 lg:sticky lg:top-6"
    >
      <h2 id="checkout-summary-title" className="text-base font-bold text-tf-ink">
        Đơn hàng
      </h2>

      {quote ? (
        <div className="flex gap-3">
          <span className="size-16 shrink-0 overflow-hidden rounded-xl bg-tf-surface">
            {quote.toyImage && <img src={quote.toyImage} alt="" className="size-full object-cover" />}
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 text-sm font-semibold text-tf-ink">{quote.title}</span>
            {quote.sellerName && <span className="mt-0.5 block text-xs text-tf-ink-muted">Người bán: {quote.sellerName}</span>}
          </span>
        </div>
      ) : (
        <span aria-hidden className="h-16 animate-pulse rounded-xl bg-tf-surface" />
      )}

      <dl className="border-y border-tf-surface py-2">
        <Row label="Giá món" value={quote ? formatVnd(quote.itemPrice) : '…'} />
        <Row label="Phí giao hàng" value={quote ? (quote.shippingFee ? formatVnd(quote.shippingFee) : 'Miễn phí') : '…'} />
        <Row label="Tổng thanh toán" value={quote ? formatVnd(quote.totalPayable) : '…'} strong />
      </dl>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-tf-ink-muted">
          <Wallet className="size-4" aria-hidden /> Số dư ví
        </span>
        <span className="font-semibold text-tf-ink tabular-nums">{balance === undefined ? '…' : formatVnd(balance)}</span>
      </div>

      {shortfall > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <span>
            Ví còn thiếu <strong className="tabular-nums">{formatVnd(shortfall)}</strong>.
          </span>
          <Link to={topupHref} className="font-semibold text-tf-primary hover:underline">
            Nạp tiền vào ví rồi quay lại
          </Link>
        </div>
      )}

      {children}

      <p className="flex items-start gap-2 text-xs text-tf-ink-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        Tiền được giữ trong tài khoản ký quỹ ToyFlow. Người bán chỉ nhận tiền khi bạn xác nhận đã nhận hàng và hài lòng.
      </p>
    </section>
  )
}

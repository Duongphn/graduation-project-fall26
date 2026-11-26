import { Check } from 'lucide-react'

import type { PurchaseOrder } from '../purchase-api'
import { formatDateTime } from '../../rentals/rental-display'

const STEPS = [
  { key: 'PAID', label: 'Đã thanh toán', at: (order: PurchaseOrder) => order.paidAt },
  { key: 'SHIPPING', label: 'Đang giao', at: (order: PurchaseOrder) => order.shippedAt },
  { key: 'COMPLETED', label: 'Hoàn tất', at: (order: PurchaseOrder) => order.completedAt },
] as const

const REACHED: Record<string, number> = { PAID: 0, SHIPPING: 1, COMPLETED: 2 }

/** Thanh tiến độ PAID → SHIPPING → COMPLETED, kèm thời điểm từng bước */
export function PurchaseProgress({ order }: { order: PurchaseOrder }) {
  const reached = REACHED[order.status] ?? -1

  return (
    <ol aria-label="Tiến độ đơn hàng" className="grid grid-cols-3 gap-2">
      {STEPS.map((step, index) => {
        const done = index <= reached
        const at = step.at(order)
        return (
          <li key={step.key} aria-current={index === reached ? 'step' : undefined} className="flex flex-col items-center gap-1.5 text-center">
            <span className="relative flex w-full items-center justify-center">
              {index > 0 && (
                <span
                  aria-hidden
                  className={`absolute right-1/2 h-0.5 w-full -translate-x-4 ${index <= reached ? 'bg-tf-primary' : 'bg-tf-surface'}`}
                />
              )}
              <span
                className={`relative grid size-8 place-items-center rounded-full text-xs font-bold ${
                  done ? 'bg-tf-primary text-white' : 'border border-tf-outline bg-white text-tf-ink-muted'
                }`}
              >
                {done ? <Check className="size-4" aria-hidden /> : index + 1}
              </span>
            </span>
            <span className={`text-xs font-semibold ${done ? 'text-tf-ink' : 'text-tf-ink-muted'}`}>{step.label}</span>
            {at && <span className="text-[11px] text-tf-ink-muted">{formatDateTime(at)}</span>}
          </li>
        )
      })}
    </ol>
  )
}

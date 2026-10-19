import { Check, CircleX, HandHeart, PackageCheck, Truck, UserRoundCheck, type LucideIcon } from 'lucide-react'

import { formatDateTime } from '../format'
import type { DonationRequestDetail } from '../types'

interface Step {
  icon: LucideIcon
  title: string
  // Mốc thời gian thật của bước (null = chưa tới)
  at: string | null
  hint: string
}

const STEP_OF_STATUS = { PENDING: 0, ACCEPTED: 1, SHIPPING: 2, COMPLETED: 3 } as const

/** Tiến trình 4 bước của một phiếu, mốc thời gian lấy từ phiếu và lần bàn giao (DONOR_SENT) */
export function DonationProgress({ request }: { request: DonationRequestDetail }) {
  if (request.status === 'REJECTED' || request.status === 'CANCELLED') {
    const reason = request.status === 'REJECTED' ? request.rejectReason : request.cancellation?.note
    return (
      <div className="flex items-start gap-3 rounded-xl border border-tf-surface bg-white p-4">
        <CircleX className="mt-0.5 size-5 shrink-0 text-tf-ink-muted" aria-hidden />
        <div className="text-sm leading-6">
          <p className="font-semibold text-tf-ink">
            {request.status === 'REJECTED' ? 'Yêu cầu nhận đã bị từ chối' : 'Phiếu quyên góp đã huỷ'}
            {request.cancellation && ` · ${formatDateTime(request.cancellation.at)}`}
          </p>
          {reason && <p className="text-tf-ink-muted">{reason}</p>}
        </div>
      </div>
    )
  }

  const sent = request.handovers.find((handover) => handover.step === 'DONOR_SENT')
  const steps: Step[] = [
    { icon: HandHeart, title: 'Có người đăng ký nhận', at: request.createdAt, hint: 'Chờ bạn đồng ý tặng' },
    { icon: UserRoundCheck, title: 'Đồng ý & đóng gói', at: request.decidedAt, hint: 'Đóng gói và gửi đồ chơi' },
    { icon: Truck, title: 'Đang chuyển tới bên nhận', at: sent?.at ?? null, hint: 'Chờ bên nhận xác nhận' },
    { icon: PackageCheck, title: 'Bên nhận đã nhận', at: request.completedAt, hint: 'Hoàn tất quyên góp' },
  ]
  const current = STEP_OF_STATUS[request.status]

  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => {
        const done = index < current || request.status === 'COMPLETED'
        const active = index === current && !done
        const Icon = done ? Check : step.icon
        return (
          <li
            key={step.title}
            aria-current={active ? 'step' : undefined}
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              active ? 'border-tf-primary bg-tf-primary-fixed' : 'border-tf-surface bg-white'
            }`}
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full ${
                done
                  ? 'bg-tf-secondary text-white'
                  : active
                    ? 'bg-tf-primary text-white'
                    : 'border border-tf-surface text-tf-ink-muted'
              }`}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 text-sm leading-5">
              <span className={`block font-semibold ${done || active ? 'text-tf-ink' : 'text-tf-ink-muted'}`}>
                {step.title}
              </span>
              <span className="block text-xs text-tf-ink-muted">
                {step.at && (done || active) ? formatDateTime(step.at) : active ? step.hint : 'Chưa tới bước này'}
              </span>
              {active && step.at && <span className="block text-xs font-medium text-tf-primary">{step.hint}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

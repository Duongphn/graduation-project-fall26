import { Check } from 'lucide-react'
import type { VerificationStatus } from '../profile-api'

const STEPS = [
  { title: 'Nộp hồ sơ', hint: 'CCCD, chân dung, SĐT' },
  { title: 'Quản trị viên duyệt', hint: 'Đối chiếu ảnh với thông tin' },
  { title: 'Đã xác minh', hint: 'Đăng đồ, thuê và thanh toán' },
]

/** Bước hiện tại suy ra từ trạng thái xác minh của tài khoản */
const CURRENT_STEP: Record<VerificationStatus, number> = { unverified: 0, rejected: 0, pending: 1, verified: 2 }

export function VerificationStepper({ status }: { status: VerificationStatus }) {
  const current = CURRENT_STEP[status]

  return (
    <ol className="verify-stepper" aria-label="Tiến trình xác minh">
      {STEPS.map((step, index) => {
        const state = index < current || status === 'verified' ? 'done' : index === current ? 'current' : 'upcoming'
        return (
          <li key={step.title} className={`verify-stepper__item is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="verify-stepper__dot">{state === 'done' ? <Check aria-hidden /> : index + 1}</span>
            <span className="verify-stepper__text">
              <span className="verify-stepper__title">{step.title}</span>
              <span className="verify-stepper__hint">{step.hint}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

import { Check, X } from 'lucide-react'
import type { VerificationStatus } from '../profile-api'

type StepState = 'done' | 'current' | 'upcoming' | 'failed'

interface Step {
  title: string
  hint: string
  state: StepState
}

/**
 * - `form`: đang điền hồ sơ → bước 1 là bước hiện tại.
 * - `result`: xem kết quả lần nộp gần nhất → bị từ chối thì bước cuối báo lỗi.
 */
function buildSteps(status: VerificationStatus, mode: 'form' | 'result'): Step[] {
  const submit = { title: 'Nộp hồ sơ', hint: 'CCCD, chân dung, SĐT' }
  const review = { title: 'Quản trị viên duyệt', hint: 'Đối chiếu ảnh với thông tin' }
  const verified = { title: 'Đã xác minh', hint: 'Đăng đồ, thuê và thanh toán' }

  if (mode === 'form' || status === 'unverified') {
    return [
      { ...submit, state: 'current' },
      { ...review, state: 'upcoming' },
      { ...verified, state: 'upcoming' },
    ]
  }
  if (status === 'pending') {
    return [
      { ...submit, state: 'done' },
      { ...review, state: 'current' },
      { ...verified, state: 'upcoming' },
    ]
  }
  if (status === 'rejected') {
    return [
      { ...submit, state: 'done' },
      { ...review, state: 'done' },
      { title: 'Bị từ chối', hint: 'Sửa và nộp lại', state: 'failed' },
    ]
  }
  return [
    { ...submit, state: 'done' },
    { ...review, state: 'done' },
    { ...verified, state: 'done' },
  ]
}

interface VerificationStepperProps {
  status: VerificationStatus
  mode?: 'form' | 'result'
  /** Nằm trong thẻ khác: bỏ viền ngoài, dùng nền nhạt */
  embedded?: boolean
}

export function VerificationStepper({ status, mode = 'form', embedded }: VerificationStepperProps) {
  const steps = buildSteps(status, mode)

  return (
    <ol className={`verify-stepper ${embedded ? 'verify-stepper--embedded' : ''}`} aria-label="Tiến trình xác minh">
      {steps.map((step, index) => (
        <li key={step.title} className={`verify-stepper__item is-${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className="verify-stepper__dot">
            {step.state === 'done' ? <Check aria-hidden /> : step.state === 'failed' ? <X aria-hidden /> : index + 1}
          </span>
          <span className="verify-stepper__text">
            <span className="verify-stepper__title">{step.title}</span>
            <span className="verify-stepper__hint">{step.hint}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

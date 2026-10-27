import dayjs from 'dayjs'
import { CircleAlert, Clock3, RefreshCw, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../routes/paths'
import type { LatestVerification, VerificationStatus } from '../profile-api'
import { VerificationStepper } from './verification-stepper'

type ResultStatus = Exclude<VerificationStatus, 'unverified'>

const META: Record<ResultStatus, { title: string; badge: string; icon: LucideIcon }> = {
  pending: { title: 'Hồ sơ đang chờ duyệt', badge: 'Chờ duyệt', icon: Clock3 },
  verified: { title: 'Tài khoản đã được xác minh', badge: 'Đã xác minh', icon: ShieldCheck },
  rejected: { title: 'Hồ sơ chưa được duyệt', badge: 'Bị từ chối', icon: ShieldAlert },
}

const formatTime = (iso: string) => dayjs(iso).format('HH:mm DD/MM/YYYY')

/** Câu mô tả dưới tiêu đề, kèm mốc thời gian thật của lần nộp gần nhất */
function Summary({ status, latest }: { status: ResultStatus; latest: LatestVerification | null }) {
  if (status === 'pending') {
    return latest ? (
      <>
        Đã gửi lúc <strong>{formatTime(latest.submittedAt)}</strong>. Kết quả sẽ hiện tại đây và trên trang hồ sơ của bạn.
      </>
    ) : (
      <>Kết quả sẽ hiện tại đây và trên trang hồ sơ của bạn.</>
    )
  }
  if (status === 'rejected') {
    return latest?.reviewedAt ? (
      <>
        Quản trị viên từ chối lúc <strong>{formatTime(latest.reviewedAt)}</strong>. Xem lý do bên dưới, sửa lại rồi nộp lại hồ sơ.
      </>
    ) : (
      <>Xem lý do bên dưới, sửa lại rồi nộp lại hồ sơ.</>
    )
  }
  return latest?.reviewedAt ? (
    <>
      Được duyệt lúc <strong>{formatTime(latest.reviewedAt)}</strong>. Bạn có thể đăng đồ chơi, thuê và thanh toán.
    </>
  ) : (
    <>Bạn có thể đăng đồ chơi, thuê và thanh toán.</>
  )
}

interface VerificationStatusCardProps {
  status: ResultStatus
  latest: LatestVerification | null
  onResubmit: () => void
}

/** Kết quả lần nộp hồ sơ gần nhất: tiêu đề + mốc thời gian, tiến trình, lý do từ chối và nút nộp lại */
export function VerificationStatusCard({ status, latest, onResubmit }: VerificationStatusCardProps) {
  const meta = META[status]
  const Icon = meta.icon

  return (
    <section className={`tf-card verify-status verify-status--${status}`} aria-labelledby="verify-status-title">
      <div className="verify-status__head">
        <span className="verify-status__icon">
          <Icon aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="verify-status__title-row">
            <h2 id="verify-status-title" className="verify-status__title">
              {meta.title}
            </h2>
            <span className={`profile-status profile-status--${status}`}>
              <Icon aria-hidden />
              {meta.badge}
            </span>
          </div>
          <p className="verify-status__summary">
            <Summary status={status} latest={latest} />
          </p>
        </div>
      </div>

      <VerificationStepper status={status} mode="result" embedded />

      {status === 'rejected' ? (
        <div className="verify-reason" role="alert">
          <div className="verify-reason__body">
            <h3 className="verify-reason__title">
              <CircleAlert aria-hidden />
              Lý do từ chối
            </h3>
            <p className="verify-reason__text">{latest?.rejectionReason || 'Quản trị viên không ghi lý do cụ thể.'}</p>
            <p className="verify-reason__hint">Gợi ý: chụp nơi đủ sáng, đặt thẻ trên nền tối, giữ máy song song với thẻ và không che mặt.</p>
          </div>
          <button type="button" className="tf-btn tf-btn--primary tf-btn--inline verify-reason__action" onClick={onResubmit}>
            <RefreshCw aria-hidden />
            Nộp lại hồ sơ
          </button>
        </div>
      ) : (
        <div className="verify-status__actions">
          <Link to={PATHS.profile} className="tf-btn tf-btn--soft tf-btn--inline">
            Về hồ sơ của tôi
          </Link>
        </div>
      )}
    </section>
  )
}

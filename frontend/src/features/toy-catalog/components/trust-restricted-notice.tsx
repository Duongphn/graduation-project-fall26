import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../routes/paths'
import { formatVnd } from '../../toy-listings/format-vnd'
import type { RenterRestrictedDetails } from '../rental-request-api'

interface TrustRestrictedNoticeProps {
  details: RenterRestrictedDetails
  /** Có khi lỗi đến từ bước báo giá: người thuê tự gửi yêu cầu để vào danh sách Admin xem xét */
  onRequestReview?: () => void
  requesting?: boolean
}

/**
 * Người thuê có điểm tin cậy dưới ngưỡng gặp món có tiền cọc trên mức cho phép: nói rõ điểm hiện tại so với
 * ngưỡng, món nào thì vẫn thuê được, và yêu cầu đã được chuyển cho quản trị viên hay chưa.
 */
export function TrustRestrictedNotice({ details, onRequestReview, requesting }: TrustRestrictedNoticeProps) {
  const { score, minTrustScore, depositCap, queued } = details
  const fill = Math.max(0, Math.min(100, score))

  return (
    <div className="trust-block" role="alert">
      <p className="trust-block__eyebrow">
        <ShieldAlert aria-hidden /> Điểm tin cậy chưa đủ
      </p>

      <div
        className="trust-block__meter"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-label={`Điểm tin cậy ${score} trên 100, cần ít nhất ${minTrustScore}`}
      >
        <span className="trust-block__fill" style={{ width: `${fill}%` }} />
        <span className="trust-block__mark" style={{ left: `${minTrustScore}%` }} aria-hidden />
      </div>
      <p className="trust-block__scale" aria-hidden>
        <span>
          Bạn <strong>{score}</strong>
        </span>
        <span>Cần {minTrustScore}</span>
      </p>

      <p className="trust-block__text">
        Món này có tiền cọc trên {formatVnd(depositCap)}. Bạn vẫn đặt thuê được các món có cọc từ {formatVnd(depositCap)}{' '}
        trở xuống.
      </p>
      <p className="trust-block__text">
        {queued
          ? 'Yêu cầu của bạn đã được chuyển cho quản trị viên ToyFlow xem xét. Bạn sẽ nhận thông báo khi có kết quả.'
          : onRequestReview
            ? 'Bạn có thể gửi yêu cầu để quản trị viên ToyFlow xem xét cho phép thuê món này.'
            : 'Yêu cầu của bạn đang chờ hoặc đã được quản trị viên xem xét. Điểm tăng khi bạn nhận thêm đánh giá tốt, thanh toán đúng hạn và giữ gìn đồ chơi.'}
      </p>
      <div className="trust-block__actions">
        {onRequestReview && !queued && (
          <button type="button" className="trust-block__button" disabled={requesting} onClick={onRequestReview}>
            {requesting ? 'Đang gửi…' : 'Gửi yêu cầu xem xét'}
          </button>
        )}
        <Link to={PATHS.myReviews} className="trust-block__link">
          Xem đánh giá của tôi
        </Link>
      </div>
    </div>
  )
}

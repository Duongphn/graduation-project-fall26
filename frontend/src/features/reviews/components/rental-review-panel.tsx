import { useQuery } from '@tanstack/react-query'
import { App, Input } from 'antd'
import { Clock, Lock, Send } from 'lucide-react'
import { useId, useState } from 'react'
import { QueryErrorAlert } from '../../../components/common'
import { formatDateTime, formatRemaining } from '../../rentals/rental-display'
import type { RentalOrderDetail } from '../../rentals/rental-orders-api'
import { hasBlockedContactDetails } from '../../toy-listings/contact-details'
import { orderReviewsQuery, RATING_WORDS, REVIEW_COMMENT_MAX, useSubmitRentalReview, type Review } from '../reviews-api'
import { ReviewItem } from './review-item'
import { StarInput, StarRating } from './star-rating'

/** Cùng câu với server (CONTACT_DETAILS_NOT_ALLOWED) để người dùng thấy lỗi trước khi gửi */
const CONTACT_MESSAGE = 'Nhận xét không được chứa số điện thoại, email hoặc liên kết.'

interface RentalReviewPanelProps {
  order: RentalOrderDetail
  isRenter: boolean
  now: number
}

/**
 * Đánh giá sau khi đơn hoàn tất (UC24): mỗi bên chấm bên kia một lần trong 14 ngày sau quyết toán.
 * Người thuê chấm thêm đồ chơi (vào điểm trung bình của tin); chủ đồ chỉ chấm người thuê.
 * Chỉ hiện khi đơn COMPLETED — đơn đang khiếu nại hay đã huỷ không có phần này.
 */
export function RentalReviewPanel({ order, isRenter, now }: RentalReviewPanelProps) {
  const reviews = useQuery(orderReviewsQuery(order.id))
  const counterpart = isRenter ? 'chủ đồ' : 'người thuê'

  if (reviews.isPending) {
    return <section className="review-panel review-panel--loading" aria-hidden />
  }
  if (reviews.isError) {
    return (
      <section className="review-panel">
        <QueryErrorAlert error={reviews.error} onRetry={() => void reviews.refetch()} />
      </section>
    )
  }

  const { myReview, theirReview, canReview, reviewDeadline } = reviews.data
  const remaining = reviewDeadline ? formatRemaining(reviewDeadline, now) : null

  return (
    <section className="review-panel" aria-labelledby="review-panel-title">
      <header className="review-panel__head">
        <p className="review-panel__eyebrow">Đánh giá giao dịch</p>
        <h2 id="review-panel-title" className="review-panel__title">
          {myReview ? 'Bạn đã đánh giá' : canReview ? `Bạn thấy ${counterpart} thế nào?` : 'Đã hết hạn đánh giá'}
        </h2>
        {canReview && reviewDeadline && remaining && (
          <p className="review-panel__due">
            <Clock aria-hidden />
            Hạn đánh giá {formatDateTime(reviewDeadline)} · <strong>{remaining}</strong>
          </p>
        )}
      </header>

      {canReview ? (
        <ReviewForm orderId={order.id} toyId={order.toyId} isRenter={isRenter} counterpart={counterpart} />
      ) : myReview ? (
        <MyReview review={myReview} />
      ) : (
        <p className="review-panel__text">
          Mỗi bên có 14 ngày sau khi quyết toán để đánh giá. Đơn này đã quá thời hạn đó.
        </p>
      )}

      {/* Đánh giá bên kia viết cho mình: chỉ để xem, không phản hồi được */}
      <div className="review-panel__theirs">
        <h3 className="review-panel__subtitle">Đánh giá {counterpart} dành cho bạn</h3>
        {theirReview ? (
          <ul className="review-list">
            <ReviewItem review={theirReview} />
          </ul>
        ) : (
          <p className="review-panel__text">
            {counterpart.charAt(0).toUpperCase() + counterpart.slice(1)} chưa đánh giá bạn.
          </p>
        )}
      </div>
    </section>
  )
}

/** Đánh giá của chính mình sau khi gửi: khoá lại, vì server không cho sửa hay xoá */
function MyReview({ review }: { review: Review }) {
  return (
    <div className="review-panel__mine">
      <dl className="review-panel__scores">
        <div>
          <dt>{review.direction === 'RENTER_TO_OWNER' ? 'Chủ đồ' : 'Người thuê'}</dt>
          <dd>
            <StarRating value={review.userRating} size="sm" />
            <span>{RATING_WORDS[review.userRating]}</span>
          </dd>
        </div>
        {review.toyRating !== undefined && (
          <div>
            <dt>Đồ chơi</dt>
            <dd>
              <StarRating value={review.toyRating} size="sm" />
              <span>{RATING_WORDS[review.toyRating]}</span>
            </dd>
          </div>
        )}
      </dl>
      {review.comment && <blockquote className="review-panel__quote">{review.comment}</blockquote>}
      <p className="review-panel__locked">
        <Lock aria-hidden /> Gửi lúc {formatDateTime(review.createdAt)}. Đánh giá không chỉnh sửa được.
      </p>
    </div>
  )
}

interface ReviewFormProps {
  orderId: string
  toyId: string
  isRenter: boolean
  counterpart: string
}

function ReviewForm({ orderId, toyId, isRenter, counterpart }: ReviewFormProps) {
  const { modal } = App.useApp()
  const formId = useId()
  const [userRating, setUserRating] = useState(0)
  const [toyRating, setToyRating] = useState(0)
  const [comment, setComment] = useState('')
  const [touched, setTouched] = useState(false)
  const submit = useSubmitRentalReview(orderId, toyId)

  const userError = touched && !userRating ? `Vui lòng chấm điểm ${counterpart}.` : null
  const toyError = touched && isRenter && !toyRating ? 'Vui lòng chấm điểm đồ chơi.' : null
  const contactError = comment && hasBlockedContactDetails(comment) ? CONTACT_MESSAGE : null

  const onSubmit = () => {
    setTouched(true)
    if (!userRating || (isRenter && !toyRating) || contactError) return
    const trimmed = comment.trim()
    modal.confirm({
      title: 'Gửi đánh giá?',
      content: 'Đánh giá được gửi một lần và không chỉnh sửa hay xoá được sau khi gửi.',
      okText: 'Gửi đánh giá',
      cancelText: 'Xem lại',
      onOk: () =>
        submit
          .mutateAsync({
            userRating,
            ...(isRenter ? { toyRating } : {}),
            ...(trimmed ? { comment: trimmed } : {}),
          })
          .catch(() => undefined),
    })
  }

  return (
    <div className="review-form">
      <StarInput
        label={isRenter ? 'Chủ đồ: giao đúng hẹn, mô tả trung thực, dễ trao đổi' : 'Người thuê: thanh toán, giữ gìn, trả đúng hẹn'}
        value={userRating}
        onChange={setUserRating}
        disabled={submit.isPending}
        error={userError}
      />
      {isRenter && (
        <StarInput
          label="Đồ chơi: tình trạng, độ an toàn, đúng như ảnh"
          value={toyRating}
          onChange={setToyRating}
          disabled={submit.isPending}
          error={toyError}
        />
      )}

      <div className="review-form__comment">
        <label htmlFor={`${formId}-comment`}>
          Nhận xét <span className="review-form__optional">(không bắt buộc)</span>
        </label>
        <Input.TextArea
          id={`${formId}-comment`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={REVIEW_COMMENT_MAX}
          showCount
          autoSize={{ minRows: 3, maxRows: 6 }}
          status={contactError ? 'error' : undefined}
          aria-invalid={Boolean(contactError)}
          aria-describedby={`${formId}-hint`}
          disabled={submit.isPending}
          placeholder={
            isRenter
              ? 'VD: Đồ chơi sạch, đủ phụ kiện như ảnh. Chủ đồ giao sớm và hướng dẫn kỹ.'
              : 'VD: Bé giữ đồ rất cẩn thận, trả đúng ngày, đóng gói gọn gàng.'
          }
        />
        <p id={`${formId}-hint`} className={contactError ? 'review-form__error' : 'review-form__hint'}>
          {contactError ?? 'Không ghi số điện thoại, email hay đường link. Mọi trao đổi nên diễn ra trên ToyFlow.'}
        </p>
      </div>

      <button
        type="button"
        className="review-form__submit"
        disabled={submit.isPending}
        onClick={onSubmit}
      >
        <Send aria-hidden /> {submit.isPending ? 'Đang gửi…' : 'Gửi đánh giá'}
      </button>
    </div>
  )
}

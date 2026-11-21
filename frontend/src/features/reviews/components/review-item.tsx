import type { CSSProperties } from 'react'
import { useRevealOnScroll } from '../../../hooks/use-reveal-on-scroll'
import type { Review } from '../reviews-api'
import { StarRating } from './star-rating'

const dateFormat = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'

interface ReviewItemProps {
  review: Review
  /** Vị trí trong danh sách: các mục hiện lệch nhau một nhịp khi cuộn tới */
  index?: number
  /** Nhãn vai của người viết, vd. "Người thuê" — trang hồ sơ dùng để phân biệt hai chiều đánh giá */
  roleLabel?: string
  /** Trang đồ chơi chấm sao đồ chơi, nơi khác chấm người */
  show?: 'user' | 'toy'
}

/** Một đánh giá: người viết, sao, ngày, nhận xét. Không có nút sửa/xoá vì server không cho */
export function ReviewItem({ review, index = 0, roleLabel, show = 'user' }: ReviewItemProps) {
  const ref = useRevealOnScroll<HTMLLIElement>(0.1)
  const stars = show === 'toy' && review.toyRating !== undefined ? review.toyRating : review.userRating

  return (
    <li
      ref={ref}
      data-reveal
      className="review-item"
      style={{ '--reveal-delay': `${Math.min(index, 5) * 70}ms` } as CSSProperties}
    >
      {review.reviewer.avatar ? (
        <img src={review.reviewer.avatar} alt="" className="review-item__avatar" loading="lazy" />
      ) : (
        <span className="review-item__avatar review-item__avatar--initials" aria-hidden>
          {initialsOf(review.reviewer.fullName)}
        </span>
      )}
      <div className="review-item__body">
        <p className="review-item__head">
          <strong className="review-item__name">{review.reviewer.fullName || 'Thành viên ToyFlow'}</strong>
          {roleLabel && <span className="review-item__role">{roleLabel}</span>}
          <time className="review-item__date" dateTime={review.createdAt}>
            {dateFormat.format(new Date(review.createdAt))}
          </time>
        </p>
        <StarRating value={stars} size="sm" />
        {review.comment ? (
          <p className="review-item__comment">{review.comment}</p>
        ) : (
          <p className="review-item__comment review-item__comment--empty">Không để lại nhận xét.</p>
        )}
      </div>
    </li>
  )
}

export function ReviewListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="review-list" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="review-item review-item--skeleton">
          <span className="review-item__avatar" />
          <span className="review-item__body">
            <span className="review-skeleton-line" style={{ width: '40%' }} />
            <span className="review-skeleton-line" style={{ width: '25%' }} />
            <span className="review-skeleton-line" style={{ width: '85%' }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

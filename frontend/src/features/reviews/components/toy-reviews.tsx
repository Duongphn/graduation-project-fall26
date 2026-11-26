import { useQuery } from '@tanstack/react-query'
import { Pagination } from 'antd'
import { useState } from 'react'
import { QueryErrorAlert } from '../../../components/common'
import { REVIEWS_PAGE_SIZE, toyReviewsQuery, type RatingSummary } from '../reviews-api'
import { ReviewItem, ReviewListSkeleton } from './review-item'
import { StarRating } from './star-rating'

/**
 * Tab "Đánh giá" của trang đồ chơi: điểm trung bình của tin + những gì người thuê viết, mới nhất trước.
 * Chỉ người thuê đã hoàn tất đơn mới chấm được, nên đây là nhận xét từ người dùng thật.
 */
export function ToyReviews({ toyId, rating }: { toyId: string; rating?: RatingSummary }) {
  const [page, setPage] = useState(1)
  const list = useQuery(toyReviewsQuery(toyId, page))
  const average = rating?.average ?? null
  const total = list.data?.total ?? rating?.count ?? 0

  return (
    <div className="toy-reviews">
      <div className="toy-reviews__summary">
        {average !== null ? (
          <>
            <p className="toy-reviews__score">
              {average.toFixed(1).replace('.', ',')}
              <span>/5</span>
            </p>
            <div>
              <StarRating value={average} />
              <p className="toy-reviews__count">Từ {rating?.count ?? total} lượt thuê đã hoàn tất</p>
            </div>
          </>
        ) : (
          <p className="toy-reviews__none">
            Món đồ này chưa có đánh giá. Người thuê được đánh giá trong 14 ngày sau khi trả đồ.
          </p>
        )}
      </div>

      {list.isPending ? (
        <ReviewListSkeleton />
      ) : list.isError ? (
        <QueryErrorAlert error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.items.length > 0 ? (
        <>
          <ul className="review-list" aria-busy={list.isPlaceholderData}>
            {list.data.items.map((review, index) => (
              <ReviewItem key={review.id} review={review} index={index} show="toy" />
            ))}
          </ul>
          {total > REVIEWS_PAGE_SIZE && (
            <Pagination
              className="review-pagination"
              current={page}
              pageSize={REVIEWS_PAGE_SIZE}
              total={total}
              showSizeChanger={false}
              onChange={setPage}
            />
          )}
        </>
      ) : null}
    </div>
  )
}

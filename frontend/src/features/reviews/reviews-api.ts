import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { useApiMutation } from '../../hooks/useApiMutation'
import { apiGet, apiPost } from '../../services/http'

/**
 * Đánh giá sau đơn thuê (UC24) — server/docs/api/reviews.md
 * POST/GET /rentals/:id/reviews, GET /toys/:id/reviews, GET /users/:id/reviews
 */

/** RENTER_TO_OWNER: người thuê chấm chủ đồ (kèm sao đồ chơi); OWNER_TO_RENTER: chủ đồ chấm người thuê */
export type ReviewDirection = 'RENTER_TO_OWNER' | 'OWNER_TO_RENTER'

export interface Review {
  id: string
  direction: ReviewDirection
  /** Server chỉ trả tên và ảnh, không bao giờ có số điện thoại hay email */
  reviewer: { id: string; fullName: string; avatar?: string }
  userRating: number
  toyRating?: number
  comment?: string
  createdAt: string
}

export interface OrderReviews {
  myReview: Review | null
  theirReview: Review | null
  /** true khi đơn COMPLETED, còn hạn và mình chưa đánh giá */
  canReview: boolean
  /** null khi đơn chưa quyết toán */
  reviewDeadline: string | null
}

export interface ReviewPage {
  items: Review[]
  total: number
  page: number
  limit: number
}

/** Điểm trung bình của tin, một chữ số thập phân; null khi chưa có ai chấm */
export interface RatingSummary {
  average: number | null
  count: number
}

export interface SubmitReviewInput {
  userRating: number
  toyRating?: number
  comment?: string
}

/** Cùng giới hạn với server (review.validation.ts) */
export const REVIEW_COMMENT_MAX = 1000
export const REVIEWS_PAGE_SIZE = 10

/** Một câu ngắn cho từng mức sao: người chấm biết mình đang nói gì, không chỉ là con số */
export const RATING_WORDS: Record<number, string> = {
  1: 'Rất tệ',
  2: 'Chưa tốt',
  3: 'Tạm ổn',
  4: 'Tốt',
  5: 'Tuyệt vời',
}

export type ReceivedRole = 'owner' | 'renter'

export const reviewKeys = {
  all: ['reviews'] as const,
  order: (orderId: string) => ['reviews', 'order', orderId] as const,
  toy: (toyId: string, page: number) => ['reviews', 'toy', toyId, page] as const,
  user: (userId: string, role: ReceivedRole | undefined, page: number) =>
    ['reviews', 'user', userId, role ?? 'all', page] as const,
}

export const orderReviewsQuery = (orderId: string) =>
  queryOptions({
    queryKey: reviewKeys.order(orderId),
    queryFn: () => apiGet<OrderReviews>(`/rentals/${orderId}/reviews`),
    staleTime: 15_000,
    retry: false,
  })

export const toyReviewsQuery = (toyId: string, page: number) =>
  queryOptions({
    queryKey: reviewKeys.toy(toyId, page),
    queryFn: () => apiGet<ReviewPage>(`/toys/${toyId}/reviews`, { page, limit: REVIEWS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  })

export const userReviewsQuery = (userId: string, role: ReceivedRole | undefined, page: number) =>
  queryOptions({
    queryKey: reviewKeys.user(userId, role, page),
    queryFn: () =>
      apiGet<ReviewPage>(`/users/${userId}/reviews`, { role, page, limit: REVIEWS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  })

/**
 * Gửi đánh giá một lần (không sửa, không xoá được). Sau đó tải lại đánh giá của đơn, danh sách đánh giá
 * và trang đồ chơi (điểm trung bình của tin thay đổi khi người thuê chấm sao đồ chơi).
 */
export const useSubmitRentalReview = (orderId: string, toyId: string) =>
  useApiMutation({
    mutationFn: (input: SubmitReviewInput) => apiPost<Review>(`/rentals/${orderId}/reviews`, input),
    successMessage: 'Đã gửi đánh giá. Cảm ơn bạn đã giúp cộng đồng ToyFlow tin cậy hơn.',
    invalidate: [reviewKeys.all, ['toy-detail', toyId], ['toy-search']],
    invalidateOnConflict: true,
  })

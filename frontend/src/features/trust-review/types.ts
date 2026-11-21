import type { Review } from '../reviews/reviews-api'

/** Admin xem xét người thuê bị chặn vì điểm tin cậy (UC24) — server/docs/api/reviews.md §5–7 */

export type TrustDecision = 'ALLOW' | 'KEEP_RESTRICTED'

export interface TrustQueueItem {
  userId: string
  fullName: string
  /** Server đã che số: "09******12" */
  phone: string
  /** null khi chưa đủ số đánh giá để tính */
  score: number | null
  reviewCount: number
  ratingAverage: number | null
  cancellations: number
  disputesLost: number
  requestedAt: string | null
  lastBlocked: {
    attemptAt: string
    toyId: string
    toyTitle: string | null
    depositAmount: number
  } | null
}

/** Ở chi tiết, `disputesLost` là danh sách; số lượng nằm ở `disputesLostCount` */
export interface TrustReviewDetail extends Omit<TrustQueueItem, 'disputesLost'> {
  disputesLostCount: number
  override: { allowedUntil: string; decidedBy: string; decidedAt: string } | null
  lastDecision: {
    decision: TrustDecision
    reason: string
    scoreAtDecision: number | null
    decidedBy: string
    decidedAt: string
  } | null
  reviews: Review[]
  expiredOrders: { orderId: string; code: string; expiredAt: string }[]
  disputesLost: { disputeId: string; code: string; verdict: string; resolvedAt: string }[]
}

export interface TrustDecisionInput {
  decision: TrustDecision
  reason: string
}

export interface TrustQueueParams {
  page: number
  limit: number
}

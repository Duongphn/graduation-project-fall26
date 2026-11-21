import type { TrustDecision } from './types'

/** Hệ số của công thức server (server/src/constants/trust.ts) — chỉ để giải thích điểm cho Admin */
export const TRUST_FORMULA = { ratingMultiplier: 20, cancelPenalty: 5, disputePenalty: 10, windowDays: 180 } as const

export const TRUST_DECISION_LABELS: Record<TrustDecision, string> = {
  ALLOW: 'Cho phép đặt thuê',
  KEEP_RESTRICTED: 'Giữ hạn chế',
}

/** Điểm là số nguyên 0–100; null nghĩa là chưa đủ đánh giá để tính */
export const formatTrustScore = (score: number | null | undefined) =>
  score === null || score === undefined ? 'Chưa có điểm' : String(Math.round(score))

/** Lý do quyết định: 10–500 ký tự như server */
export const TRUST_REASON_MIN = 10
export const TRUST_REASON_MAX = 500

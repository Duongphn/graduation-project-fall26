import { isAxiosError } from 'axios'
import { getApiErrorMessage, httpClient } from '../../services/http-client'

/**
 * Trợ lý AI tư vấn chọn đồ chơi. Endpoint dự kiến của backend (chưa có): POST /ai/advisor.
 * AI chỉ gợi ý — không thay người dùng đặt thuê/mua (xem server/docs/backend-architecture.md).
 */

export interface AdvisorRequest {
  message: string
  /** Các lượt trước để AI hiểu ngữ cảnh hội thoại */
  history: { role: 'user' | 'assistant'; text: string }[]
}

export interface AdvisorResponse {
  reply: string
}

export async function askAdvisor(payload: AdvisorRequest): Promise<AdvisorResponse> {
  const { data } = await httpClient.post<AdvisorResponse>('/ai/advisor', payload, { timeout: 30_000 })
  return data
}

/** 404/501/503 = backend chưa có hoặc đang tắt tính năng AI */
const UNAVAILABLE_STATUSES = new Set([404, 501, 503])

export function getAdvisorErrorMessage(error: unknown): string {
  if (isAxiosError(error) && error.response && UNAVAILABLE_STATUSES.has(error.response.status)) {
    return 'Trợ lý AI đang được hoàn thiện nên chưa trả lời được. Bạn quay lại sau nhé!'
  }
  return getApiErrorMessage(error)
}

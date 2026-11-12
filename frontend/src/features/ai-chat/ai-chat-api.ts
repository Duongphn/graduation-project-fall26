import { isAxiosError } from 'axios'
import { getApiErrorMessage, httpClient, type ApiResponse } from '../../services/http-client'

/**
 * Trợ lý AI tư vấn chọn đồ chơi: POST /ai/advisor. Server gọi Gemini; frontend không gọi AI trực tiếp
 * và không giữ API key. AI chỉ gợi ý, phụ huynh tự quyết định thuê/mua (server/docs/backend-architecture.md).
 */

/** Trợ lý chỉ gợi ý tin cho thuê hoặc đang bán, không gợi ý đồ tặng */
export type AdvisorListingType = 'any' | 'rent' | 'sell'

/** Bộ lọc server trả về sau mỗi lượt; giữ lại và gửi kèm lượt sau để Robo nhớ ngữ cảnh */
export interface AdvisorFilters {
  /** Tuổi của bé (năm); null khi chưa biết */
  ageYears: number | null
  /** Slug danh mục, hoặc 'any' */
  category: string
  listingType: AdvisorListingType
  /** Giá tối đa (VND), với tin thuê là giá mỗi ngày; null: không giới hạn */
  maxPrice: number | null
  /** Khu vực phụ huynh nhắc tới (server chưa lọc theo khu vực) */
  area: string
}

export interface AdvisorHistoryItem {
  role: 'user' | 'assistant'
  text: string
}

export interface AdvisorRequest {
  message: string
  filters?: AdvisorFilters
  /** Chỉ 2 tin gần nhất, mỗi tin tối đa 300 ký tự (tiết kiệm token) */
  history: AdvisorHistoryItem[]
  /** true: bộ lọc chọn bằng nút, server bỏ qua bước AI trích bộ lọc */
  filtersFromButtons: boolean
}

export interface AdvisorToy {
  id: string
  name: string
  listingType: 'rent' | 'sell'
  /** Tin thuê: giá mỗi ngày */
  priceOrRate: number
  condition: string
  /** Ảnh bìa; chuỗi rỗng khi tin không có ảnh */
  image: string
  reason: string
}

export type AdvisorSource = 'ai' | 'faq' | 'fallback' | 'no_result' | 'off_topic'

export interface AdvisorResponse {
  reply: string
  toys: AdvisorToy[]
  filters: AdvisorFilters
  source: AdvisorSource
}

export async function askAdvisor(payload: AdvisorRequest): Promise<AdvisorResponse> {
  // Server gọi Gemini tới 2 lần và không giới hạn thời gian chờ: bỏ timeout mặc định 15 giây của httpClient
  const { data } = await httpClient.post<ApiResponse<AdvisorResponse>>('/ai/advisor', payload, {
    timeout: 0,
  })
  return data.data
}

export function getAdvisorErrorMessage(error: unknown): string {
  const status = isAxiosError(error) ? error.response?.status : undefined
  if (status === 401) return 'Bạn cần đăng nhập để trò chuyện với Robo.'
  if (status === 503) return 'Trợ lý AI đang tạm tắt. Bạn vẫn có thể tự tìm đồ chơi trong mục Thuê đồ chơi nhé!'
  if (status === 404) return 'Trợ lý AI chưa sẵn sàng. Bạn quay lại sau nhé!'
  // 429 (hết lượt hôm nay), 400…: dùng thông báo tiếng Việt của server
  return getApiErrorMessage(error)
}

import type { ADVISOR_LISTING_TYPES, AdvisorSource } from '../constants/ai-advisor.js';

/** Chỉ tin cho thuê hoặc đang bán (constants/ai-advisor.ts). */
export type AdvisorToyListingType = (typeof ADVISOR_LISTING_TYPES)[number];
export type AdvisorListingType = 'any' | AdvisorToyListingType;

/** Giá trị "không lọc" của category và listingType. */
export const ANY_FILTER = 'any';

/**
 * Bộ lọc tìm đồ chơi. Đây là ngữ cảnh hội thoại: server trả về, client giữ và gửi lại mỗi lượt
 * (không dùng AI để tóm tắt hội thoại).
 */
export interface AdvisorFilters {
  /** Tuổi của bé (năm); null khi chưa biết. */
  ageYears: number | null;
  /** Slug danh mục đang hoạt động, hoặc 'any'. */
  category: string;
  listingType: AdvisorListingType;
  /** Giá tối đa (VND); null khi không giới hạn. Với tin thuê là giá mỗi ngày. */
  maxPrice: number | null;
  /** Khu vực phụ huynh nhắc tới; chỉ để hiểu ngữ cảnh, chưa dùng để lọc (Toy không có địa chỉ). */
  area: string;
}

export interface AdvisorHistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

/** Bộ lọc client gửi lên: trường nào cũng có thể thiếu; server làm sạch lại. */
export type AdvisorFiltersInput = { [K in keyof AdvisorFilters]?: AdvisorFilters[K] | undefined };

export interface AdvisorAskInput {
  userId: string;
  message: string;
  filters?: AdvisorFiltersInput | undefined;
  history: AdvisorHistoryItem[];
  filtersFromButtons: boolean;
}

export interface AdvisorToy {
  id: string;
  name: string;
  listingType: AdvisorToyListingType;
  priceOrRate: number;
  condition: string;
  image: string;
  reason: string;
}

export interface AdvisorReply {
  reply: string;
  toys: AdvisorToy[];
  filters: AdvisorFilters;
  source: AdvisorSource;
}

export interface AdvisorCategory {
  id: string;
  slug: string;
  name: string;
}

export interface AdvisorToyQuery {
  ageYears: number | null;
  categoryId: string | null;
  listingType: AdvisorToyListingType | null;
  maxPrice: number | null;
  /** Không gợi ý tin của chính người hỏi. */
  excludeOwnerId: string;
  limit: number;
}

export interface AdvisorToyRecord {
  id: string;
  title: string;
  description: string;
  listingType: AdvisorToyListingType;
  priceOrRate: number;
  condition: string;
  ageRange: { minAge: number; maxAge: number };
  image: string;
}

export interface AdvisorTokenUsage {
  input: number;
  output: number;
  thoughts: number;
  calls: number;
}

export interface AdvisorLogEntry {
  userId: string;
  status: AdvisorSource;
  prompt: string;
  response: string;
  tokenUsage: AdvisorTokenUsage;
  latencyMs: number;
  modelName?: string | undefined;
}

import type {
  AdvisorCategory,
  AdvisorLogEntry,
  AdvisorToyQuery,
  AdvisorToyRecord,
} from '../types/ai-advisor.types.js';

export interface LlmUsage {
  input: number;
  output: number;
  thoughts: number;
}

export interface LlmJsonRequest {
  /** Cố định giữa các lần gọi cùng loại (tối ưu token, mục 8.3). */
  systemInstruction: string;
  prompt: string;
  responseJsonSchema: Record<string, unknown>;
  /** Trần cho TỔNG token suy nghĩ + token trả lời (mục 8.6). */
  maxOutputTokens: number;
}

export interface LlmJsonResult {
  /** Văn bản JSON thô; service tự parse và kiểm tra lại. */
  text: string;
  usage: LlmUsage;
}

/** Mô hình ngôn ngữ trả JSON theo schema: Gemini ở production, bản giả trong test. */
export interface AdvisorLlm {
  readonly modelName: string;
  /** Ném lỗi khi lỗi mạng, hết thời gian chờ hoặc chưa cấu hình key. */
  generateJson(request: LlmJsonRequest): Promise<LlmJsonResult>;
}

export interface AdvisorCatalogPort {
  listActiveCategories(): Promise<AdvisorCategory[]>;
  /** Tin đã duyệt, chưa bán, không phải của người hỏi; mới nhất trước. */
  findActive(criteria: AdvisorToyQuery): Promise<AdvisorToyRecord[]>;
}

export interface AdvisorUsageLogPort {
  /** Số lượt hỏi đã tính vào giới hạn (không tính FAQ) của người dùng kể từ `since`. */
  countSince(userId: string, since: Date): Promise<number>;
  record(entry: AdvisorLogEntry): Promise<void>;
}

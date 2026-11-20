import { env } from './env.js';

// Trợ lý AI tư vấn đồ chơi (POST /api/v1/ai/toy-advice).
// API key chỉ đọc từ biến môi trường ở server, không bao giờ gửi xuống frontend.

const positiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
};

/** Để trống hoặc 0: không giới hạn (null). Có giá trị thì phải là số nguyên dương (ms). */
const optionalTimeout = (name: string): number | null => {
  const raw = process.env[name]?.trim();
  if (!raw || raw === '0') return null;
  return positiveInteger(name, 0);
};

/** 0: không giới hạn (null); để trống: mặc định 15 request/phút như gói miễn phí của Gemini. */
const requestsPerMinute = (): number | null => {
  const raw = process.env.GEMINI_RPM?.trim();
  if (raw === '0') return null;
  return positiveInteger('GEMINI_RPM', 15);
};

/** Request vượt giới hạn mỗi phút xếp hàng chờ tối đa chừng này, quá thì trả kết quả tìm kiếm thường. */
export const GEMINI_QUEUE_MAX_WAIT_MS = 30_000;

/** Cấu hình service dùng; test thay từng phần qua ContainerOverrides.aiAdvisorSettings. */
export interface AiAdvisorSettings {
  enabled: boolean;
  modelName: string;
  /** Thời gian chờ mỗi lần gọi Gemini (ms); null: chờ tới khi Gemini trả lời hoặc báo lỗi. */
  timeoutMs: number | null;
  /** Số request tối đa gửi lên Gemini mỗi phút (cả hệ thống); null: không giới hạn. */
  requestsPerMinute: number | null;
  dailyLimit: number;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

const advisor: AiAdvisorSettings = Object.freeze({
  // Chỉ bật khi AI_ADVISOR_ENABLED=true, và không bao giờ khi chạy test (test bật qua override).
  enabled: env.nodeEnv !== 'test' && process.env.AI_ADVISOR_ENABLED === 'true',
  modelName: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
  timeoutMs: optionalTimeout('GEMINI_TIMEOUT_MS'),
  requestsPerMinute: requestsPerMinute(),
  dailyLimit: positiveInteger('AI_ADVISOR_DAILY_LIMIT', 20),
});

export const aiConfig = Object.freeze({
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? '',
  advisor,
});

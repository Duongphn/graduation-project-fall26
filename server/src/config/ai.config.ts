import { env } from './env.js';

// Trợ lý AI tư vấn đồ chơi (POST /api/v1/ai/advisor).
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

/** Cấu hình service dùng; test thay từng phần qua ContainerOverrides.aiAdvisorSettings. */
export interface AiAdvisorSettings {
  enabled: boolean;
  modelName: string;
  /** Thời gian chờ mỗi lần gọi Gemini (ms); null: chờ tới khi Gemini trả lời hoặc báo lỗi. */
  timeoutMs: number | null;
  dailyLimit: number;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

const advisor: AiAdvisorSettings = Object.freeze({
  // Chỉ bật khi AI_ADVISOR_ENABLED=true, và không bao giờ khi chạy test (test bật qua override).
  enabled: env.nodeEnv !== 'test' && process.env.AI_ADVISOR_ENABLED === 'true',
  modelName: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
  timeoutMs: optionalTimeout('GEMINI_TIMEOUT_MS'),
  dailyLimit: positiveInteger('AI_ADVISOR_DAILY_LIMIT', 20),
});

export const aiConfig = Object.freeze({
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? '',
  advisor,
});

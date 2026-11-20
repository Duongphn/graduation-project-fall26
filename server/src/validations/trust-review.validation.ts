import type { TrustDecision } from '../models/index.js';
import { AppError } from '../utils/app-error.js';

export interface TrustDecisionInput {
  decision: TrustDecision;
  reason: string;
}

export interface TrustQueueQuery {
  page: number;
  limit: number;
}

const MIN_REASON = 10;
const MAX_REASON = 500;
const MAX_LIMIT = 50;

/** decision ALLOW | KEEP_RESTRICTED; reason 10-500 characters after trim. */
export function validateTrustDecisionInput(body: unknown): TrustDecisionInput {
  if (typeof body !== 'object' || body === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
  }
  const { decision, reason } = body as Record<string, unknown>;
  if (decision !== 'ALLOW' && decision !== 'KEEP_RESTRICTED') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Quyết định phải là ALLOW hoặc KEEP_RESTRICTED.');
  }
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed.length < MIN_REASON || trimmed.length > MAX_REASON) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Lý do phải dài từ ${MIN_REASON} đến ${MAX_REASON} ký tự.`,
    );
  }
  return { decision, reason: trimmed };
}

function positiveInt(value: unknown, fallback: number, name: string, max?: number): number {
  if (value === undefined || value === '') return fallback;
  const n = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 1 || (max !== undefined && n > max)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Tham số ${name} không hợp lệ.`);
  }
  return n;
}

/** page >= 1 (default 1), limit 1..50 (default 20). */
export function validateTrustQueueQuery(query: unknown): TrustQueueQuery {
  const q = (typeof query === 'object' && query !== null ? query : {}) as Record<string, unknown>;
  return {
    page: positiveInt(q.page, 1, 'page'),
    limit: positiveInt(q.limit, 20, 'limit', MAX_LIMIT),
  };
}

import { DISPUTE_VERDICTS, type DisputeStatus, type DisputeVerdict } from '../constants/dispute.js';
import { AppError } from '../utils/app-error.js';

export interface OpenDisputeInput {
  reason: string;
  description: string;
}

/**
 * Checked before the service uploads the evidence, so bad input leaves no orphan photos.
 * Whether the reason fits the claimant's role is checked by DisputeService.
 */
export function validateOpenDisputeInput(body: unknown): OpenDisputeInput {
  if (typeof body !== 'object' || body === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
  }

  const { reason, description } = body as Record<string, unknown>;

  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Vui lòng chọn lý do khiếu nại.');
  }

  const trimmed = typeof description === 'string' ? description.trim() : '';
  if (trimmed.length < 10 || trimmed.length > 1000) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Mô tả khiếu nại phải có độ dài từ 10 đến 1000 ký tự.',
    );
  }

  return { reason: reason.trim(), description: trimmed };
}

export interface RespondDisputeInput {
  message: string;
}

export function validateRespondDisputeInput(body: unknown): RespondDisputeInput {
  const { message } = (typeof body === 'object' && body !== null ? body : {}) as Record<
    string,
    unknown
  >;
  const trimmed = typeof message === 'string' ? message.trim() : '';
  if (trimmed.length < 10 || trimmed.length > 1000) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Nội dung phản hồi phải có độ dài từ 10 đến 1000 ký tự.',
    );
  }
  return { message: trimmed };
}

export interface ListDisputesQuery {
  role?: 'claimant' | 'respondent';
  status?: DisputeStatus;
  page: number;
  limit: number;
}

const STATUSES: readonly string[] = ['open', 'under_review', 'resolved', 'closed'];

function positiveInt(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const n = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 1) {
    throw new AppError(400, 'VALIDATION_ERROR', `Tham số ${name} không hợp lệ.`);
  }
  return n;
}

function optionalStatus(value: unknown): DisputeStatus | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !STATUSES.includes(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Tham số status không hợp lệ.');
  }
  return value as DisputeStatus;
}

function pageOf(q: Record<string, unknown>): { page: number; limit: number } {
  return {
    page: positiveInt(q.page, 1, 'page'),
    limit: Math.min(positiveInt(q.limit, 20, 'limit'), 50),
  };
}

export function validateListDisputesQuery(query: unknown): ListDisputesQuery {
  const q = (typeof query === 'object' && query !== null ? query : {}) as Record<string, unknown>;
  const result: ListDisputesQuery = pageOf(q);
  if (q.role !== undefined && q.role !== '') {
    if (q.role !== 'claimant' && q.role !== 'respondent') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Tham số role không hợp lệ.');
    }
    result.role = q.role;
  }
  const status = optionalStatus(q.status);
  if (status) {
    result.status = status;
  }
  return result;
}

export interface AdminDisputeListQuery {
  status: DisputeStatus;
  page: number;
  limit: number;
}

/** Admin queue: disputes under review unless another status is asked for. */
export function validateAdminDisputeListQuery(query: unknown): AdminDisputeListQuery {
  const q = (typeof query === 'object' && query !== null ? query : {}) as Record<string, unknown>;
  return { status: optionalStatus(q.status) ?? 'under_review', ...pageOf(q) };
}

export interface ResolveDisputeInput {
  verdict: DisputeVerdict;
  compensation: number;
  reason: string;
}

/**
 * Shape only. The cap and the verdict / amount rule depend on the order and the claimant,
 * so DisputeService checks them.
 */
export function validateResolveDisputeInput(body: unknown): ResolveDisputeInput {
  const { verdict, compensation, reason } = (
    typeof body === 'object' && body !== null ? body : {}
  ) as Record<string, unknown>;

  if (typeof verdict !== 'string' || !(DISPUTE_VERDICTS as readonly string[]).includes(verdict)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Phán quyết không hợp lệ.', {
      allowed: DISPUTE_VERDICTS,
    });
  }
  if (typeof compensation !== 'number' || !Number.isInteger(compensation) || compensation < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Số tiền bồi thường phải là số nguyên không âm.');
  }
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed.length < 30 || trimmed.length > 500) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Lý do phán quyết phải có độ dài từ 30 đến 500 ký tự.',
    );
  }
  return { verdict: verdict as DisputeVerdict, compensation, reason: trimmed };
}

import { AppError } from '../utils/app-error.js';

export interface SubmitReviewInput {
  userRating: number;
  toyRating?: number;
  comment?: string;
}

const MAX_COMMENT = 1000;

const isRating = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;

/**
 * Types and ranges only. Whether toyRating fits the reviewer's role, and the contact details
 * check, belong to ReviewService. A whitespace-only comment counts as no comment.
 */
export function validateSubmitReviewInput(body: unknown): SubmitReviewInput {
  if (typeof body !== 'object' || body === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
  }
  const { userRating, toyRating, comment } = body as Record<string, unknown>;

  if (!isRating(userRating)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Điểm đánh giá phải là số nguyên từ 1 đến 5.');
  }
  const input: SubmitReviewInput = { userRating };

  if (toyRating !== undefined && toyRating !== null) {
    if (!isRating(toyRating)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Điểm đánh giá đồ chơi phải là số nguyên từ 1 đến 5.',
      );
    }
    input.toyRating = toyRating;
  }

  if (comment !== undefined && comment !== null) {
    if (typeof comment !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Nhận xét không hợp lệ.');
    }
    const trimmed = comment.trim();
    if (trimmed.length > MAX_COMMENT) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Nhận xét không được vượt quá ${MAX_COMMENT} ký tự.`,
      );
    }
    if (trimmed !== '') input.comment = trimmed;
  }

  return input;
}

export interface ReviewListQuery {
  page: number;
  limit: number;
  role?: 'owner' | 'renter';
}

const MAX_LIMIT = 50;

function positiveInt(value: unknown, fallback: number, name: string, max?: number): number {
  if (value === undefined || value === '') return fallback;
  const n = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 1 || (max !== undefined && n > max)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Tham số ${name} không hợp lệ.`);
  }
  return n;
}

/** page >= 1, limit 1..50 (above 50 is refused, not clamped), role owner|renter. */
export function validateReviewListQuery(query: unknown): ReviewListQuery {
  const q = (typeof query === 'object' && query !== null ? query : {}) as Record<string, unknown>;
  const result: ReviewListQuery = {
    page: positiveInt(q.page, 1, 'page'),
    limit: positiveInt(q.limit, 20, 'limit', MAX_LIMIT),
  };
  if (q.role !== undefined && q.role !== '') {
    if (q.role !== 'owner' && q.role !== 'renter') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Tham số role không hợp lệ.');
    }
    result.role = q.role;
  }
  return result;
}

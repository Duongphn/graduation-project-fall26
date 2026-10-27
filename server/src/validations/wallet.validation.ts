import { AppError } from '../utils/app-error.js';

export interface AdminCreditInput {
  amount: number;
  note?: string;
}

export interface WalletPaginationQuery {
  page: number;
  limit: number;
}

export function validateAdminCreditInput(body: unknown): AdminCreditInput {
  if (typeof body !== 'object' || body === null) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ.');
  }

  const { amount, note } = body as Record<string, unknown>;

  if (
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > 100_000_000
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Số tiền không hợp lệ. Phải là số nguyên từ 1 đến 100,000,000 VND.',
    );
  }

  let sanitizedNote: string | undefined;
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Ghi chú phải là chuỗi ký tự.');
    }
    const trimmed = note.trim();
    if (trimmed.length > 200) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Ghi chú không được vượt quá 200 ký tự.');
    }
    sanitizedNote = trimmed.length > 0 ? trimmed : undefined;
  }

  return {
    amount,
    ...(sanitizedNote !== undefined ? { note: sanitizedNote } : {}),
  };
}

export function validateWalletPaginationQuery(query: unknown): WalletPaginationQuery {
  let page = 1;
  let limit = 20;

  if (typeof query === 'object' && query !== null) {
    const q = query as Record<string, unknown>;
    if (q.page !== undefined && q.page !== '') {
      const p = Number(q.page);
      if (!Number.isInteger(p) || p < 1) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Trang phải là số nguyên >= 1.');
      }
      page = p;
    }

    if (q.limit !== undefined && q.limit !== '') {
      const l = Number(q.limit);
      if (!Number.isInteger(l) || l < 1 || l > 100) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Số lượng mỗi trang phải từ 1 đến 100.');
      }
      limit = l;
    }
  }

  return { page, limit };
}

import { walletTransactionListTypes } from '../constants/wallet-transaction.js';
import { AppError } from '../utils/app-error.js';
import { MAX_PAGE_LIMIT } from './common.validation.js';
import { z } from './zod.js';

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

const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Ngày không hợp lệ.')
  .transform((value) => new Date(value));

/**
 * GET /wallets/me/transactions, same query as the lead's API: `type` all | credit | debit,
 * `kind` = reference.kind (rental_order, payment, withdrawal…, `all` = no filter), optional date range.
 */
export const walletTransactionListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(20),
    type: z.enum(walletTransactionListTypes).optional(),
    kind: z.string().trim().min(1).max(50).optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .refine((query) => !query.startDate || !query.endDate || query.startDate <= query.endDate, {
    message: 'Ngày bắt đầu không được sau ngày kết thúc.',
    path: ['startDate'],
  });
export type WalletTransactionListQuery = z.infer<typeof walletTransactionListQuerySchema>;

/**
 * POST /wallets/withdrawals (same body and rules as the lead's withdrawalRequestSchema). The
 * minimum and maximum amount are System Settings (UC30), checked by WithdrawalService.
 */
export const withdrawalBodySchema = z
  .object({
    amount: z
      .number({ error: 'Số tiền rút phải là số nguyên.' })
      .int('Số tiền rút phải là số nguyên.')
      .positive('Số tiền rút phải lớn hơn 0.'),
    bankInfo: z
      .object({
        bankName: z.string().trim().min(2, 'Tên ngân hàng phải có ít nhất 2 ký tự.').max(100, 'Tên ngân hàng quá dài.'),
        accountNumber: z
          .string()
          .trim()
          .regex(/^[0-9]{6,25}$/, 'Số tài khoản chỉ bao gồm số (từ 6 đến 25 chữ số).'),
        accountHolderName: z
          .string()
          .trim()
          .min(2, 'Tên chủ tài khoản phải có ít nhất 2 ký tự.')
          .max(100, 'Tên chủ tài khoản quá dài.')
          .transform((value) => value.toUpperCase()),
      })
      .strict(),
  })
  .strict();
export type WithdrawalBody = z.infer<typeof withdrawalBodySchema>;

/** GET /wallets/withdrawals: newest first, 20 per page by default (like the lead's API) */
export const withdrawalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(20),
});
export type WithdrawalListQuery = z.infer<typeof withdrawalListQuerySchema>;

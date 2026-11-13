import { z } from 'zod';
import { WITHDRAWAL_LIMITS } from '../constants/wallet.constant.js';
import type {
  AdminProcessWithdrawalInput,
  AdminWithdrawalQuery,
  CreateWithdrawalInput,
} from '../types/wallet.types.js';
import { AppError } from '../utils/app-error.js';

export const transactionListQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 1))
    .refine((val) => Number.isInteger(val) && val >= 1, {
      message: 'page must be a positive integer.',
    }),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 20))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 100, {
      message: 'limit must be between 1 and 100.',
    }),
  type: z.enum(['all', 'credit', 'debit']).optional(),
  kind: z.string().trim().optional(),
  startDate: z
    .string()
    .optional()
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), {
      message: 'startDate must be a valid date.',
    })
    .transform((val) => (val ? new Date(val) : undefined)),
  endDate: z
    .string()
    .optional()
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), {
      message: 'endDate must be a valid date.',
    })
    .transform((val) => (val ? new Date(val) : undefined)),
});

export const systemWalletParamSchema = z.object({
  ownerType: z.enum(['escrow', 'platform_fee', 'platform'], {
    message: 'ownerType must be one of: escrow, platform_fee, platform',
  }),
});

export interface TransactionListQuery {
  page: number;
  limit: number;
  type?: 'all' | 'credit' | 'debit' | undefined;
  kind?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}

export function validateTransactionListQuery(query: unknown): TransactionListQuery {
  const result = transactionListQuerySchema.safeParse(query);
  if (!result.success) {
    const firstErrorMessage =
      Object.values(result.error.flatten().fieldErrors).flat()[0] || 'Invalid query parameters.';
    throw new AppError(400, 'VALIDATION_ERROR', firstErrorMessage);
  }

  const data = result.data;
  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'startDate cannot be after endDate.');
  }

  const cleaned: TransactionListQuery = {
    page: data.page,
    limit: data.limit,
  };
  if (data.type !== undefined) cleaned.type = data.type;
  if (data.kind !== undefined && data.kind !== '') cleaned.kind = data.kind;
  if (data.startDate !== undefined) cleaned.startDate = data.startDate;
  if (data.endDate !== undefined) cleaned.endDate = data.endDate;

  return cleaned;
}

export function validateSystemWalletParam(params: unknown): {
  ownerType: 'escrow' | 'platform_fee' | 'platform';
} {
  const result = systemWalletParamSchema.safeParse(params);
  if (!result.success) {
    const firstErrorMessage =
      Object.values(result.error.flatten().fieldErrors).flat()[0] || 'Invalid wallet type parameter.';
    throw new AppError(400, 'VALIDATION_ERROR', firstErrorMessage);
  }
  return result.data;
}

export const withdrawalRequestSchema = z.object({
  amount: z
    .number()
    .int('Số tiền rút phải là số nguyên.')
    .min(
      WITHDRAWAL_LIMITS.MIN_AMOUNT,
      `Số tiền rút tối thiểu là ${WITHDRAWAL_LIMITS.MIN_AMOUNT.toLocaleString('vi-VN')} VNĐ.`,
    )
    .max(
      WITHDRAWAL_LIMITS.MAX_AMOUNT,
      `Số tiền rút tối đa cho một lần là ${WITHDRAWAL_LIMITS.MAX_AMOUNT.toLocaleString('vi-VN')} VNĐ.`,
    ),
  bankInfo: z.object({
    bankName: z
      .string()
      .trim()
      .min(2, 'Tên ngân hàng phải có ít nhất 2 ký tự.')
      .max(100, 'Tên ngân hàng quá dài.'),
    accountNumber: z
      .string()
      .trim()
      .regex(/^[0-9]{6,25}$/, 'Số tài khoản chỉ bao gồm số (từ 6 đến 25 chữ số).'),
    accountHolderName: z
      .string()
      .trim()
      .min(2, 'Tên chủ tài khoản phải có ít nhất 2 ký tự.')
      .max(100, 'Tên chủ tài khoản quá dài.')
      .transform((val) => val.toUpperCase()),
  }),
});

export function validateWithdrawalRequest(body: unknown): CreateWithdrawalInput {
  if (!body || typeof body !== 'object') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be an object.');
  }

  const result = withdrawalRequestSchema.safeParse(body);
  if (!result.success) {
    const firstErrorMessage =
      Object.values(result.error.flatten().fieldErrors).flat()[0] ||
      (result.error.issues[0]?.message ?? 'Thông tin rút tiền không hợp lệ.');
    throw new AppError(400, 'VALIDATION_ERROR', firstErrorMessage);
  }
  return result.data;
}

export const adminProcessWithdrawalSchema = z
  .object({
    status: z.enum(['completed', 'rejected', 'approved']),
    notes: z.string().trim().optional(),
  })
  .refine(
    (data) => {
      if (data.status === 'rejected') {
        return typeof data.notes === 'string' && data.notes.length >= 5;
      }
      return true;
    },
    {
      message: 'Vui lòng nhập lý do từ chối (tối thiểu 5 ký tự).',
      path: ['notes'],
    },
  );


export function validateAdminProcessWithdrawal(body: unknown): AdminProcessWithdrawalInput {
  if (!body || typeof body !== 'object') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be an object.');
  }

  const result = adminProcessWithdrawalSchema.safeParse(body);
  if (!result.success) {
    const firstErrorMessage =
      Object.values(result.error.flatten().fieldErrors).flat()[0] ||
      (result.error.issues[0]?.message ?? 'Dữ liệu xử lý rút tiền không hợp lệ.');
    throw new AppError(400, 'VALIDATION_ERROR', firstErrorMessage);
  }
  return result.data as AdminProcessWithdrawalInput;
}

export const adminWithdrawalListQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 1))
    .refine((val) => Number.isInteger(val) && val >= 1, {
      message: 'page must be a positive integer.',
    }),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 20))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 100, {
      message: 'limit must be between 1 and 100.',
    }),
  status: z.enum(['all', 'pending', 'completed', 'approved', 'rejected']).optional(),
  startDate: z
    .string()
    .optional()
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), {
      message: 'startDate must be a valid date.',
    })
    .transform((val) => (val ? new Date(val) : undefined)),
  endDate: z
    .string()
    .optional()
    .refine((val) => !val || !Number.isNaN(Date.parse(val)), {
      message: 'endDate must be a valid date.',
    })
    .transform((val) => (val ? new Date(val) : undefined)),
});

export function validateAdminWithdrawalListQuery(query: unknown): AdminWithdrawalQuery {
  const result = adminWithdrawalListQuerySchema.safeParse(query);
  if (!result.success) {
    const firstErrorMessage =
      Object.values(result.error.flatten().fieldErrors).flat()[0] || 'Invalid query parameters.';
    throw new AppError(400, 'VALIDATION_ERROR', firstErrorMessage);
  }

  const data = result.data;
  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'startDate cannot be after endDate.');
  }

  const cleaned: AdminWithdrawalQuery = {
    page: data.page,
    limit: data.limit,
  };
  if (data.status !== undefined) cleaned.status = data.status;
  if (data.startDate !== undefined) cleaned.startDate = data.startDate;
  if (data.endDate !== undefined) cleaned.endDate = data.endDate;

  return cleaned;
}



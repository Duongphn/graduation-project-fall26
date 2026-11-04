import { z } from 'zod';
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

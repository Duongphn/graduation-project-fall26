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
});

export const systemWalletParamSchema = z.object({
  ownerType: z.enum(['escrow', 'platform_fee', 'platform'], {
    message: 'ownerType must be one of: escrow, platform_fee, platform',
  }),
});

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

export function validateTransactionListQuery(query: unknown): TransactionListQuery {
  const result = transactionListQuerySchema.safeParse(query);
  if (!result.success) {
    const firstErrorMessage =
      Object.values(result.error.flatten().fieldErrors).flat()[0] || 'Invalid query parameters.';
    throw new AppError(400, 'VALIDATION_ERROR', firstErrorMessage);
  }
  return result.data;
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

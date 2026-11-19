import { TOPUP_LIMITS } from '../constants/wallet-transaction.js';
import { z } from './zod.js';

const vnd = (value: number) => value.toLocaleString('vi-VN');

/** POST /payments/topup/vnpay (same body and limits as the lead's validateTopupInput) */
export const topupBodySchema = z
  .object({
    amount: z
      .number({ error: 'Số tiền nạp phải là số nguyên hợp lệ.' })
      .int('Số tiền nạp phải là số nguyên hợp lệ.')
      .min(TOPUP_LIMITS.MIN_AMOUNT, `Số tiền nạp tối thiểu là ${vnd(TOPUP_LIMITS.MIN_AMOUNT)} VNĐ.`)
      .max(TOPUP_LIMITS.MAX_AMOUNT, `Số tiền nạp tối đa mỗi lần là ${vnd(TOPUP_LIMITS.MAX_AMOUNT)} VNĐ.`),
    /** Optional VNPay bank code (e.g. NCB) to skip the bank list on VNPay */
    bankCode: z.string().trim().min(1).max(20).optional(),
  })
  .strict();
export type TopupBody = z.infer<typeof topupBodySchema>;

export const paymentCodeParamsSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Mã giao dịch không hợp lệ.'),
});
export type PaymentCodeParams = z.infer<typeof paymentCodeParamsSchema>;

/** POST /payments/topup/payos: same limits as the VNPay top-up */
export const payosTopupBodySchema = topupBodySchema.pick({ amount: true }).strict();
export type PayosTopupBody = z.infer<typeof payosTopupBodySchema>;

/** GET /payments/payos-return?orderCode= (PayOS also adds code, id, cancel, status: ignored) */
export const payosReturnQuerySchema = z.object({
  orderCode: z.string().trim().regex(/^\d{1,16}$/, 'Mã giao dịch không hợp lệ.'),
});
export type PayosReturnQuery = z.infer<typeof payosReturnQuerySchema>;

/** /payments/payos/:code (the numeric PayOS orderCode) */
export const payosCodeParamsSchema = z.object({
  code: z.string().trim().regex(/^\d{1,16}$/, 'Mã giao dịch không hợp lệ.'),
});
export type PayosCodeParams = z.infer<typeof payosCodeParamsSchema>;

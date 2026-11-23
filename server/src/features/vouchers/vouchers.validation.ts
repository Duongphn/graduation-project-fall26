import { z } from 'zod';

export const applyRentalVoucherSchema = z.object({
  code: z.string().trim().min(1, 'Mã voucher không được để trống'),
  rentalFee: z.number().positive('Tiền thuê phải lớn hơn 0'),
  depositAmount: z.number().nonnegative('Tiền cọc không được âm'),
  orderType: z.string().default('RENTAL'),
});

export type ApplyRentalVoucherInput = z.infer<typeof applyRentalVoucherSchema>;

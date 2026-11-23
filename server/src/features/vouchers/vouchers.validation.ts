import { z } from 'zod';

export const voucherCodeSchema = z
  .string()
  .trim()
  .min(4, 'Mã voucher phải có ít nhất 4 ký tự')
  .max(20, 'Mã voucher không được vượt quá 20 ký tự')
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'Mã voucher chỉ gồm chữ cái, chữ số, gạch ngang (-) hoặc gạch dưới (_)',
  )
  .transform((v) => v.toUpperCase());

export const applyRentalVoucherSchema = z.object({
  code: z.string().trim().min(1, 'Mã voucher không được để trống'),
  rentalFee: z.number().positive('Tiền thuê phải lớn hơn 0'),
  depositAmount: z.number().nonnegative('Tiền cọc không được âm'),
  orderType: z.string().default('RENTAL'),
  toyId: z.string().trim().optional(),
});

export const createOwnerVoucherSchema = z
  .object({
    code: voucherCodeSchema,
    discountType: z.enum(['percentage', 'fixed']),
    discountValue: z.number().positive('Giá trị giảm phải lớn hơn 0'),
    minOrderValue: z.number().nonnegative('Giá trị đơn tối thiểu không được âm').optional(),
    maxDiscount: z.number().positive('Mức giảm tối đa phải lớn hơn 0').optional(),
    quantity: z.number().int().positive('Số lượt phát hành phải là số nguyên dương lớn hơn 0'),
    validFrom: z.coerce.date(),
    validTo: z.coerce.date(),
    applicableToyIds: z.array(z.string().trim()).optional(),
  })
  .refine(
    (data) => {
      if (data.discountType === 'percentage') {
        return data.discountValue >= 1 && data.discountValue <= 100;
      }
      return true;
    },
    {
      message: 'Mức giảm theo phần trăm phải nằm trong khoảng từ 1% đến 100%',
      path: ['discountValue'],
    },
  )
  .refine(
    (data) => data.validTo > data.validFrom,
    {
      message: 'Thời hạn kết thúc (validTo) phải sau thời gian bắt đầu (validFrom)',
      path: ['validTo'],
    },
  );

export const updateOwnerVoucherSchema = z
  .object({
    discountType: z.enum(['percentage', 'fixed']).optional(),
    discountValue: z.number().positive('Giá trị giảm phải lớn hơn 0').optional(),
    minOrderValue: z.number().nonnegative('Giá trị đơn tối thiểu không được âm').optional(),
    maxDiscount: z.number().positive('Mức giảm tối đa phải lớn hơn 0').optional(),
    quantity: z.number().int().positive('Số lượt phát hành phải lớn hơn 0').optional(),
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
    applicableToyIds: z.array(z.string().trim()).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine(
    (data) => {
      if (data.discountType === 'percentage' && data.discountValue !== undefined) {
        return data.discountValue >= 1 && data.discountValue <= 100;
      }
      return true;
    },
    {
      message: 'Mức giảm theo phần trăm phải nằm trong khoảng từ 1% đến 100%',
      path: ['discountValue'],
    },
  )
  .refine(
    (data) => {
      if (data.validFrom && data.validTo) {
        return data.validTo > data.validFrom;
      }
      return true;
    },
    {
      message: 'Thời hạn kết thúc (validTo) phải sau thời gian bắt đầu (validFrom)',
      path: ['validTo'],
    },
  );

export type ApplyRentalVoucherInput = z.infer<typeof applyRentalVoucherSchema>;
export type CreateOwnerVoucherInput = z.infer<typeof createOwnerVoucherSchema>;
export type UpdateOwnerVoucherInput = z.infer<typeof updateOwnerVoucherSchema>;

import { z } from 'zod';

export const quotePurchasePricingSchema = z.object({
  toyId: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, 'Mã đồ chơi (toyId) không hợp lệ.'),
  deliveryMethod: z.enum(['DELIVERY', 'LOCAL_PICKUP']).default('DELIVERY'),
  province: z.string().trim().optional(),
});

export const createBuyNowSchema = z
  .object({
    toyId: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{24}$/, 'Mã đồ chơi (toyId) không hợp lệ.'),
    deliveryMethod: z.enum(['DELIVERY', 'LOCAL_PICKUP']),
    recipientName: z.string().trim().optional(),
    recipientPhone: z.string().trim().optional(),
    province: z.string().trim().optional(),
    district: z.string().trim().optional(),
    ward: z.string().trim().optional(),
    street: z.string().trim().optional(),
    notes: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự.').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.deliveryMethod === 'DELIVERY') {
      if (!data.recipientName || data.recipientName.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vui lòng nhập họ tên người nhận hàng.',
          path: ['recipientName'],
        });
      }
      if (!data.recipientPhone || !/^(?:\+84|0)\d{9,10}$/.test(data.recipientPhone.replace(/[\s.-]/g, ''))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Số điện thoại người nhận không hợp lệ.',
          path: ['recipientPhone'],
        });
      }
      if (!data.province || data.province.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vui lòng chọn Tỉnh/Thành phố nhận hàng.',
          path: ['province'],
        });
      }
      if (!data.ward || data.ward.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vui lòng chọn Phường/Xã nhận hàng.',
          path: ['ward'],
        });
      }
      if (!data.street || data.street.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vui lòng nhập địa chỉ cụ thể (số nhà, tên đường).',
          path: ['street'],
        });
      }
    }
  });

export type QuotePurchasePricingInput = z.infer<typeof quotePurchasePricingSchema>;
export type CreateBuyNowInput = z.infer<typeof createBuyNowSchema>;

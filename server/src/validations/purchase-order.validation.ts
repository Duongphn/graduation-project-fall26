import { z } from 'zod';
import { normalizeVietnamPhone } from '../utils/phone.js';

/** "+84 933 000 003" -> "0933000003", the form the address book stores; other text unchanged. */
const toDomesticPhone = (value: string): string => {
  const normalized = normalizeVietnamPhone(value);
  return normalized ? `0${normalized.slice(3)}` : value;
};

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
      if (!data.recipientPhone || !normalizeVietnamPhone(data.recipientPhone)) {
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
  })
  .transform((data) =>
    data.recipientPhone === undefined
      ? data
      : { ...data, recipientPhone: toDomesticPhone(data.recipientPhone) },
  );

export type QuotePurchasePricingInput = z.infer<typeof quotePurchasePricingSchema>;
export type CreateBuyNowInput = z.infer<typeof createBuyNowSchema>;

export const confirmShippingSchema = z.object({
  carrierName: z.string().trim().min(1, 'Vui lòng cung cấp đơn vị vận chuyển hoặc cách giao hàng.'),
  trackingCode: z.string().trim().optional().default(''),
  photos: z
    .array(
      z.object({
        url: z.string().url('URL ảnh không hợp lệ.'),
        publicId: z.string().optional(),
      }),
    )
    .max(5, 'Tối đa 5 ảnh đóng gói.')
    .optional()
    .default([]),
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự.').optional(),
});

export const confirmReceivedSchema = z.object({
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự.').optional(),
});

export type ConfirmShippingInput = z.infer<typeof confirmShippingSchema>;
export type ConfirmReceivedInput = z.infer<typeof confirmReceivedSchema>;

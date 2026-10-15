import { z } from 'zod';

export const createPaymentLinkSchema = z.object({
  amount: z
    .number({ message: 'Số tiền thanh toán là bắt buộc' })
    .int('Số tiền thanh toán phải là số nguyên')
    .min(1000, 'Số tiền thanh toán tối thiểu là 1,000 VNĐ'),
  orderType: z.string().min(1, 'Loại đơn hàng không được để trống').default('order'),
  orderId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'orderId phải là ObjectId hợp lệ (24 ký tự hex)')
    .optional(),
  userId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'userId phải là ObjectId hợp lệ (24 ký tự hex)')
    .optional(),
  description: z
    .string()
    .max(25, 'Nội dung thanh toán tối đa 25 ký tự không dấu')
    .optional(),
  returnUrl: z.string().url('returnUrl phải là URL hợp lệ').optional(),
  cancelUrl: z.string().url('cancelUrl phải là URL hợp lệ').optional(),
  buyerName: z.string().optional(),
  buyerEmail: z.string().email('buyerEmail không hợp lệ').optional(),
  buyerPhone: z.string().optional(),
});

export const cancelPaymentLinkSchema = z.object({
  cancellationReason: z.string().max(255, 'Lý do hủy tối đa 255 ký tự').optional(),
});

export const orderCodeParamSchema = z.object({
  orderCode: z.string().regex(/^\d+$/, 'Mã giao dịch orderCode phải là số nguyên dương'),
});

export const confirmWebhookSchema = z.object({
  webhookUrl: z.string().url('webhookUrl phải là URL hợp lệ'),
});

export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;
export type CancelPaymentLinkInput = z.infer<typeof cancelPaymentLinkSchema>;

import { z } from 'zod';

/** R03 III.6.1.1 (10): người nhận 2–50 ký tự, SĐT 10 số bắt đầu bằng 0, số nhà/đường 3–120 ký tự */
const addressFields = {
  recipientName: z
    .string()
    .trim()
    .min(2, 'Tên người nhận cần từ 2 đến 50 ký tự')
    .max(50, 'Tên người nhận cần từ 2 đến 50 ký tự'),
  phone: z
    .string()
    .trim()
    .regex(/^0\d{9}$/, 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0'),
  province: z.string().trim().min(2, 'Chọn tỉnh/thành phố').max(100, 'Tỉnh/thành phố tối đa 100 ký tự'),
  ward: z.string().trim().min(2, 'Chọn phường/xã').max(100, 'Phường/xã tối đa 100 ký tự'),
  street: z
    .string()
    .trim()
    .min(3, 'Số nhà, tên đường cần từ 3 đến 120 ký tự')
    .max(120, 'Số nhà, tên đường cần từ 3 đến 120 ký tự'),
  isDefault: z.boolean(),
};

export const createAddressSchema = z
  .object({ ...addressFields, isDefault: addressFields.isDefault.optional() })
  .strict();

export const updateAddressSchema = z
  .object(addressFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Không có thông tin nào để cập nhật');

export const addressIdParamsSchema = z.object({
  addressId: z.string().regex(/^[a-f\d]{24}$/i, 'Mã địa chỉ không hợp lệ'),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

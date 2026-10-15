import { z } from 'zod'

/** Khớp kiểm tra của backend: họ tên và từng phần địa chỉ đều phải khác rỗng sau khi trim */

export const personalInfoSchema = z.object({
  fullName: z.string().trim().min(1, 'Nhập họ và tên để người thuê, người mua biết bạn là ai.').max(100, 'Họ và tên tối đa 100 ký tự.'),
})

export type PersonalInfoValues = z.infer<typeof personalInfoSchema>

export const addressSchema = z.object({
  street: z.string().trim().min(1, 'Nhập số nhà và tên đường.'),
  ward: z.string().trim().min(1, 'Nhập phường/xã.'),
  district: z.string().trim().min(1, 'Nhập quận/huyện.'),
  province: z.string().trim().min(1, 'Nhập tỉnh/thành phố.'),
})

export type AddressValues = z.infer<typeof addressSchema>

export const EMPTY_ADDRESS: AddressValues = { street: '', ward: '', district: '', province: '' }

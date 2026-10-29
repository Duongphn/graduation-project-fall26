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

/** Cùng regex với backend (identity-verification.schemas.ts) để báo lỗi trước khi gửi */
const VN_PHONE_REGEX = /^(0|84|\+84)(3|5|7|8|9)[0-9]{8}$/
const VN_IDCARD_REGEX = /^[0-9]{9}$|^[0-9]{12}$/

export const verificationSchema = z.object({
  idCardNumber: z.string().trim().regex(VN_IDCARD_REGEX, 'Số CCCD/CMND gồm 12 hoặc 9 chữ số, không có dấu cách.'),
  phone: z.string().trim().regex(VN_PHONE_REGEX, 'Số điện thoại chưa đúng định dạng, ví dụ 0901234567.'),
})

export type VerificationValues = z.infer<typeof verificationSchema>

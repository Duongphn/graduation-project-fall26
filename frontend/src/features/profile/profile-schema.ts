import { z } from 'zod'

/** Khớp kiểm tra của backend (user.service.ts, address.validation.ts) */

/** Ngày hôm nay theo giờ máy, dạng YYYY-MM-DD (giá trị `max` của ô ngày sinh) */
export const todayIsoDate = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export const BIO_MAX_LENGTH = 200

export const personalInfoSchema = z.object({
  // Khớp FULL_NAME_PATTERN của backend (R03 III.6.1.1 (5)): 2–50 chữ cái và khoảng trắng
  fullName: z
    .string()
    .trim()
    .min(1, 'Nhập họ và tên để người thuê, người mua biết bạn là ai.')
    .regex(/^[\p{L} ]{2,50}$/u, 'Họ và tên chỉ gồm chữ cái và khoảng trắng, từ 2 đến 50 ký tự.'),
  // Ô date trả về '' khi trống hoặc YYYY-MM-DD; backend nhận từ 01/01/1900 đến hôm nay
  dateOfBirth: z
    .string()
    .refine((value) => value === '' || (value >= '1900-01-01' && value <= todayIsoDate()), 'Ngày sinh không hợp lệ.'),
  gender: z.enum(['', 'female', 'male', 'other']),
  bio: z.string().trim().max(BIO_MAX_LENGTH, `Giới thiệu tối đa ${BIO_MAX_LENGTH} ký tự.`),
})

export type PersonalInfoValues = z.infer<typeof personalInfoSchema>

/** R03 III.6.1.1 (10): khớp address.validation.ts của backend (không còn cấp quận/huyện) */
export const addressSchema = z.object({
  recipientName: z.string().trim().min(2, 'Tên người nhận cần từ 2 đến 50 ký tự.').max(50, 'Tên người nhận cần từ 2 đến 50 ký tự.'),
  phone: z.string().trim().regex(/^0\d{9}$/, 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.'),
  province: z.string().trim().min(2, 'Nhập tỉnh/thành phố.').max(100, 'Tỉnh/thành phố tối đa 100 ký tự.'),
  ward: z.string().trim().min(2, 'Nhập phường/xã.').max(100, 'Phường/xã tối đa 100 ký tự.'),
  street: z.string().trim().min(3, 'Số nhà, tên đường cần từ 3 đến 120 ký tự.').max(120, 'Số nhà, tên đường cần từ 3 đến 120 ký tự.'),
  isDefault: z.boolean(),
})

export type AddressValues = z.infer<typeof addressSchema>

/** Cùng regex với backend (identity-verification.schemas.ts) để báo lỗi trước khi gửi */
const VN_PHONE_REGEX = /^(0|84|\+84)(3|5|7|8|9)[0-9]{8}$/
const VN_IDCARD_REGEX = /^[0-9]{9}$|^[0-9]{12}$/

export const verificationSchema = z.object({
  idCardNumber: z.string().trim().regex(VN_IDCARD_REGEX, 'Số CCCD/CMND gồm 12 hoặc 9 chữ số, không có dấu cách.'),
  phone: z.string().trim().regex(VN_PHONE_REGEX, 'Số điện thoại chưa đúng định dạng, ví dụ 0901234567.'),
})

export type VerificationValues = z.infer<typeof verificationSchema>

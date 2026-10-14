import { z } from 'zod'

const PHONE_PATTERN = /^(0|\+84)\d{9}$/

const normalizePhone = (value: string) => value.replace(/\s/g, '')
const isPhone = (value: string) => PHONE_PATTERN.test(normalizePhone(value))
const isEmail = (value: string) => z.email().safeParse(value).success

export const PASSWORD_MIN_LENGTH = 8
export const OTP_LENGTH = 6

const emailField = z.string().trim().min(1, 'Vui lòng nhập email').refine(isEmail, 'Email không hợp lệ')

const newPasswordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`)
  .regex(/[a-zA-Z]/, 'Mật khẩu cần có ít nhất một chữ cái')
  .regex(/\d/, 'Mật khẩu cần có ít nhất một chữ số')

const confirmPasswordField = z.string().min(1, 'Vui lòng nhập lại mật khẩu')

const passwordsMatch = {
  check: (values: { password: string; confirmPassword: string }) => values.password === values.confirmPassword,
  params: { message: 'Mật khẩu nhập lại không khớp', path: ['confirmPassword'] },
}

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập số điện thoại hoặc email')
    .refine((value) => isPhone(value) || isEmail(value), 'Số điện thoại hoặc email không hợp lệ'),
  // Không áp chính sách độ mạnh khi đăng nhập — chỉ kiểm tra khi đăng ký/đổi mật khẩu
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
  rememberMe: z.boolean(),
})

export type LoginFormValues = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Vui lòng nhập họ và tên').max(100, 'Họ và tên tối đa 100 ký tự'),
    phone: z
      .string()
      .trim()
      .min(1, 'Vui lòng nhập số điện thoại')
      .refine(isPhone, 'Số điện thoại không hợp lệ')
      .transform(normalizePhone),
    email: emailField,
    password: newPasswordField,
    confirmPassword: confirmPasswordField,
    acceptTerms: z.boolean().refine(Boolean, 'Bạn cần đồng ý với điều khoản để tiếp tục'),
  })
  .refine(passwordsMatch.check, passwordsMatch.params)

/** Giá trị người dùng nhập (trước transform) — dùng cho react-hook-form */
export type RegisterFormInput = z.input<typeof registerSchema>
/** Giá trị đã chuẩn hoá — dùng để gửi API */
export type RegisterFormValues = z.output<typeof registerSchema>

export const otpSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Mã xác minh gồm ${OTP_LENGTH} chữ số`),
})

export type OtpFormValues = z.infer<typeof otpSchema>

export const forgotPasswordSchema = z.object({ email: emailField })

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({ password: newPasswordField, confirmPassword: confirmPasswordField })
  .refine(passwordsMatch.check, passwordsMatch.params)

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>

export function getPasswordStrength(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0
  let score = 0
  if (password.length >= PASSWORD_MIN_LENGTH) score++
  if (/[a-zA-Z]/.test(password) && /\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password) || /[A-Z]/.test(password) || password.length >= 12) score++
  return Math.max(score, 1) as 1 | 2 | 3
}

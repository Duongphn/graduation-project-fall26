import { z } from 'zod';

export const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'Google ID Token là bắt buộc'),
});

export const googleExchangeSchema = z.object({
  code: z.string().min(1, 'Mã đăng nhập Google (code) là bắt buộc'),
});

export const verifyGoogleOtpSchema = z.object({
  tempToken: z.string().min(1, 'Token tạm thời (tempToken) là bắt buộc'),
  otpCode: z
    .string()
    .length(6, 'Mã OTP phải có đúng 6 chữ số')
    .regex(/^\d+$/, 'Mã OTP chỉ bao gồm các chữ số'),
});

export const resendGoogleOtpSchema = z.object({
  tempToken: z.string().min(1, 'Token tạm thời (tempToken) là bắt buộc'),
});

export const devTestLoginSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
});

export const PASSWORD_MIN_LENGTH = 8;
export const passwordField = (label: string) =>
  z
    .string()
    .min(PASSWORD_MIN_LENGTH, `${label} phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`)
    .regex(/[A-Za-z]/, `${label} phải có ít nhất một chữ cái`)
    .regex(/\d/, `${label} phải có ít nhất một chữ số`);

/** R03 III.1.1.1 (5) và III.6.1.1 (5): Họ và tên gồm 2 đến 50 chữ cái và khoảng trắng */
export const FULL_NAME_PATTERN = /^[\p{L} ]{2,50}$/u;

export const registerSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  password: passwordField('Mật khẩu'),
  fullName: z
    .string()
    .trim()
    .regex(FULL_NAME_PATTERN, 'Họ và tên chỉ gồm chữ cái và khoảng trắng, từ 2 đến 50 ký tự'),
  phone: z
    .string()
    .regex(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, 'Số điện thoại không hợp lệ (Ví dụ: 0912345678)'),
});

export const verifyRegistrationOtpSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  otpCode: z
    .string()
    .length(6, 'Mã OTP phải có đúng 6 chữ số')
    .regex(/^\d+$/, 'Mã OTP chỉ bao gồm các chữ số'),
});

export const resendRegistrationOtpSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Vui lòng nhập số điện thoại hoặc email'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
});

export const verifyResetCodeSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  otpCode: z
    .string()
    .length(6, 'Mã OTP phải có đúng 6 chữ số')
    .regex(/^\d+$/, 'Mã OTP chỉ bao gồm các chữ số'),
});

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(1, 'Token đặt lại mật khẩu (resetToken) là bắt buộc'),
  newPassword: passwordField('Mật khẩu mới'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh Token là bắt buộc'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh Token là bắt buộc'),
  allDevices: z.boolean().optional().default(false),
});

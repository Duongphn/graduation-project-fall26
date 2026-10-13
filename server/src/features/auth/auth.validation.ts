import { z } from 'zod';

export const googleLoginSchema = z.object({
  idToken: z.string().min(1, 'Google ID Token là bắt buộc'),
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

export const registerSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  fullName: z.string().min(2, 'Họ và tên phải có ít nhất 2 ký tự').max(100, 'Họ và tên quá dài'),
  phone: z
    .string()
    .regex(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, 'Số điện thoại không hợp lệ (Ví dụ: 0912345678)'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  otpCode: z
    .string()
    .length(6, 'Mã OTP phải có đúng 6 chữ số')
    .regex(/^\d+$/, 'Mã OTP chỉ bao gồm các chữ số'),
  newPassword: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh Token là bắt buộc'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh Token là bắt buộc'),
  allDevices: z.boolean().optional().default(false),
});

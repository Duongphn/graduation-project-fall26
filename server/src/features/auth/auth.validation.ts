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

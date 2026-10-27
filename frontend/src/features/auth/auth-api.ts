import { httpClient, type ApiResponse } from '../../services/http-client'
import { queryClient } from '../../services/query-client'
import { clearAuthTokens, getRefreshToken } from '../../services/token-storage'
import type { LoginFormValues, RegisterFormValues } from './auth-schemas'

export type UserRole = 'USER' | 'ADMIN'

export interface AuthUser {
  id: string
  email: string
  fullName: string
  phone?: string
  role: UserRole
  /** Chỉ có khi người dùng có ảnh đại diện (thường là tài khoản Google) */
  avatar?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

/** Phiên đăng nhập — khớp nguyên dạng `data` backend trả về */
export interface AuthSession {
  user: AuthUser
  tokens: AuthTokens
}

/** Mã OTP đăng ký được gửi tới email */
export interface OtpChallenge {
  email: string
  resendAfterSeconds: number
}

export async function login({ identifier, password }: LoginFormValues): Promise<AuthSession> {
  const { data } = await httpClient.post<ApiResponse<AuthSession>>('/auth/login', {
    identifier: identifier.trim(),
    password,
  })
  return data.data
}

export async function register({ fullName, phone, email, password }: RegisterFormValues): Promise<OtpChallenge> {
  const { data } = await httpClient.post<ApiResponse<OtpChallenge>>('/auth/register', {
    fullName,
    phone,
    email,
    password,
  })
  return data.data
}

/** Xác minh OTP gửi về email — backend chỉ tạo tài khoản ở bước này, không tự đăng nhập */
export async function verifyRegistrationOtp(payload: { email: string; otpCode: string }): Promise<void> {
  await httpClient.post<ApiResponse<{ user: AuthUser }>>('/auth/register/verify-otp', payload)
}

export async function resendRegistrationOtp(email: string): Promise<OtpChallenge> {
  const { data } = await httpClient.post<ApiResponse<OtpChallenge>>('/auth/register/resend-otp', { email })
  return data.data
}

export interface ResetCodeChallenge {
  email: string
  resendAfterSeconds: number
}

/** Backend trả thành công kể cả khi email không tồn tại để tránh lộ danh sách tài khoản */
export async function requestPasswordReset(email: string): Promise<ResetCodeChallenge> {
  const { data } = await httpClient.post<ApiResponse<ResetCodeChallenge>>('/auth/forgot-password', { email })
  return data.data
}

export async function verifyPasswordResetCode(payload: { email: string; otpCode: string }): Promise<string> {
  const { data } = await httpClient.post<ApiResponse<{ resetToken: string }>>('/auth/verify-reset-code', payload)
  return data.data.resetToken
}

export async function resetPassword(payload: { resetToken: string; newPassword: string }): Promise<void> {
  await httpClient.post<ApiResponse<{ message: string }>>('/auth/reset-password', payload)
}

/** Đổi mã `googleCode` (backend gắn vào URL khi Gmail đã đăng ký) lấy phiên đăng nhập — mã chỉ dùng được một lần */
export async function exchangeGoogleLoginCode(code: string): Promise<AuthSession> {
  const { data } = await httpClient.post<ApiResponse<AuthSession>>('/auth/google/exchange', { code })
  return data.data
}

/** Backend chỉ trả `message` khi gửi lại OTP Google; OTP hết hạn sau 5 phút nên cho gửi lại sau 60 giây */
export const GOOGLE_OTP_RESEND_SECONDS = 60

export async function verifyGoogleOtp(payload: { tempToken: string; otpCode: string }): Promise<AuthSession> {
  const { data } = await httpClient.post<ApiResponse<AuthSession>>('/auth/google/verify-otp', payload)
  return data.data
}

export async function resendGoogleOtp(tempToken: string): Promise<{ resendAfterSeconds: number }> {
  await httpClient.post<ApiResponse<{ message: string }>>('/auth/google/resend-otp', { tempToken })
  return { resendAfterSeconds: GOOGLE_OTP_RESEND_SECONDS }
}

export function getGoogleAuthUrl(): string {
  return `${httpClient.defaults.baseURL}/auth/google`
}

/**
 * Đăng xuất: thu hồi refresh token trên máy chủ (POST /auth/logout) rồi xoá phiên ở trình duyệt.
 * Máy chủ lỗi hoặc mất mạng vẫn xoá phiên cục bộ để người dùng không bị kẹt.
 */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken()
  try {
    if (refreshToken) await httpClient.post('/auth/logout', { refreshToken })
  } catch {
    // Bỏ qua: token có thể đã hết hạn hoặc bị thu hồi
  } finally {
    clearAuthTokens()
    queryClient.clear()
  }
}

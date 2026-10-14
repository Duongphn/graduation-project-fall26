import { httpClient } from '../../services/http-client'
import type { ApiResponse } from '../../types/api'
import type { LoginFormValues, RegisterFormValues } from './auth-schemas'

export interface AuthUser {
  id: string
  fullName: string
  role: string
}

export interface AuthSession {
  accessToken: string
  user: AuthUser
}

export interface OtpChallenge {
  phone: string
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

export async function verifyRegistrationOtp(payload: { phone: string; otp: string }): Promise<AuthSession> {
  const { data } = await httpClient.post<ApiResponse<AuthSession>>('/auth/register/verify-otp', payload)
  return data.data
}

export async function resendRegistrationOtp(phone: string): Promise<OtpChallenge> {
  const { data } = await httpClient.post<ApiResponse<OtpChallenge>>('/auth/register/resend-otp', { phone })
  return data.data
}

export interface ResetCodeChallenge {
  email: string
  resendAfterSeconds: number
}

/** Backend nên trả thành công kể cả khi email không tồn tại để tránh lộ danh sách tài khoản */
export async function requestPasswordReset(email: string): Promise<ResetCodeChallenge> {
  const { data } = await httpClient.post<ApiResponse<ResetCodeChallenge>>('/auth/password/forgot', { email })
  return data.data
}

export async function verifyPasswordResetCode(payload: { email: string; code: string }): Promise<string> {
  const { data } = await httpClient.post<ApiResponse<{ resetToken: string }>>(
    '/auth/password/verify-reset-code',
    payload,
  )
  return data.data.resetToken
}

export async function resetPassword(payload: { resetToken: string; newPassword: string }): Promise<void> {
  await httpClient.post<ApiResponse<null>>('/auth/password/reset', payload)
}

export function getGoogleAuthUrl(): string {
  return `${httpClient.defaults.baseURL}/auth/google`
}

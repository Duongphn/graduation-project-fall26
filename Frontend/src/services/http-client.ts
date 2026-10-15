import axios, { isAxiosError } from 'axios'
import { env } from '../config/env'
import type { ApiErrorBody } from '../types/api'
import { ApiError } from './api-error'
import { getAccessToken } from './token-storage'

/** Envelope phản hồi thành công của backend: khai báo một lần trong types/api.ts */
export type { ApiResponse } from '../types/api'

type ApiErrorResponse = ApiErrorBody

export const httpClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15_000,
})

// Gắn access token (nếu đã đăng nhập) cho mọi request tới API cần xác thực
httpClient.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  // Chỉ khi dev và chưa đăng nhập: backend nhận hai header này khi chạy với ALLOW_DEV_AUTH=true
  const devUserId = import.meta.env.VITE_DEV_USER_ID
  if (import.meta.env.DEV && devUserId && !token) {
    config.headers.set('x-dev-user-id', devUserId)
    config.headers.set('x-dev-role', import.meta.env.VITE_DEV_ROLE ?? 'USER')
  }
  return config
})

export function getApiErrorCode(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.code
  return isAxiosError<ApiErrorResponse>(error) ? error.response?.data?.error?.code : undefined
}

export function getApiErrorMessage(error: unknown): string {
  // Lỗi từ các helper apiGet/apiPost… (services/http.ts)
  if (error instanceof ApiError) return error.message
  if (isAxiosError<ApiErrorResponse>(error)) {
    const message = error.response?.data?.error?.message
    if (message) return message
    if (!error.response) return 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.'
  }
  return 'Đã có lỗi bất ngờ xảy ra. Vui lòng thử lại.'
}

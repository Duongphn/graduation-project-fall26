import axios, { isAxiosError } from 'axios'
import { env } from '../config/env'
import type { ApiErrorResponse } from '../types/api'

export const httpClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15_000,
})

export function getApiErrorMessage(error: unknown): string {
  if (isAxiosError<ApiErrorResponse>(error)) {
    const message = error.response?.data?.error?.message
    if (message) return message
    if (!error.response) return 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.'
  }
  return 'Đã có lỗi bất ngờ xảy ra. Vui lòng thử lại.'
}

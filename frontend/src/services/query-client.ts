import { QueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { ApiError } from './api-error'

const MAX_RETRIES = 3

const httpStatus = (error: unknown): number | undefined => {
  if (error instanceof ApiError) return error.status
  if (isAxiosError(error)) return error.response?.status
  return undefined
}

/**
 * Thử lại tối đa 3 lần khi mất mạng hoặc máy chủ lỗi (5xx). Lỗi 4xx (404 không tìm thấy, 400 mã
 * sai, 403…) gọi lại vẫn vậy: báo lỗi ngay thay vì để trang xương ~7 giây; trừ 408 và 429.
 */
export const shouldRetryQuery = (failureCount: number, error: unknown): boolean => {
  const status = httpStatus(error)
  if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) return false
  return failureCount < MAX_RETRIES
}

/** Dùng chung cho React (QueryClientProvider) và loader của router — để dữ liệu router tải sẵn nằm trong cùng cache */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetryQuery } },
})

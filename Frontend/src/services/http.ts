import { isAxiosError, type AxiosRequestConfig } from 'axios'

import type {
  ApiErrorBody,
  ApiResponse,
  Paginated,
  PaginatedResponse,
  PaginationParams,
  WithMessage,
} from '../types/api'
import { ApiError } from './api-error'
import { httpClient } from './http-client'

// Helpers over the one axios instance (httpClient in http-client.ts): they unwrap the envelope,
// so feature api.ts files return plain data, and they throw ApiError. The conversion happens
// here, not in a global interceptor, so code that calls httpClient directly still gets the raw
// AxiosError that getApiErrorMessage reads.
const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error
  if (isAxiosError<ApiErrorBody>(error)) {
    const status = error.response?.status ?? 0
    const body = error.response?.data
    if (body && body.success === false) {
      return new ApiError(status, body.error.code, body.error.message, body.error.details)
    }
    if (!error.response) {
      return new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ. Vui lòng thử lại.')
    }
    return new ApiError(status, 'HTTP_ERROR', 'Đã có lỗi xảy ra. Vui lòng thử lại.')
  }
  return new ApiError(0, 'UNKNOWN_ERROR', 'Đã có lỗi xảy ra. Vui lòng thử lại.')
}

const request = async <R>(config: AxiosRequestConfig): Promise<R> => {
  try {
    return (await httpClient.request<R>(config)).data
  } catch (error) {
    throw toApiError(error)
  }
}

export const apiGet = async <T>(url: string, params?: object): Promise<T> =>
  (await request<ApiResponse<T>>({ method: 'get', url, params })).data

export const apiGetPage = async <T>(
  url: string,
  params?: PaginationParams & object,
): Promise<Paginated<T>> => {
  const body = await request<PaginatedResponse<T>>({ method: 'get', url, params })
  return { items: body.data, pagination: body.pagination }
}

export const apiPost = async <T>(url: string, body?: unknown): Promise<T> =>
  (await request<ApiResponse<T>>({ method: 'post', url, data: body })).data

export const apiPatch = async <T>(url: string, body?: unknown): Promise<T> =>
  (await request<ApiResponse<T>>({ method: 'patch', url, data: body })).data

export const apiPut = async <T>(url: string, body?: unknown): Promise<T> =>
  (await request<ApiResponse<T>>({ method: 'put', url, data: body })).data

export const apiDelete = async <T>(url: string): Promise<T> =>
  (await request<ApiResponse<T>>({ method: 'delete', url })).data

// Like apiPost/apiPatch/apiDelete, but also returns the backend `message` for the success toast
// (e.g. "2 yêu cầu đang chạy vẫn tiếp tục"). Fallback texts belong in the feature hooks.
export const apiSendWithMessage = async <T>(
  method: 'post' | 'patch' | 'put' | 'delete',
  url: string,
  body?: unknown,
): Promise<WithMessage<T>> => {
  const result = await request<ApiResponse<T>>({ method, url, data: body })
  return { data: result.data, ...(result.message ? { message: result.message } : {}) }
}

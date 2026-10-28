import { isAxiosError } from 'axios'

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

// Helpers over develop's httpClient (same base URL and Bearer token) for the endpoints that
// answer with the success envelope { success, data, pagination? }. They unwrap the envelope and
// turn the backend error body { error: { code, message, details } } into an ApiError.

const toApiError = (error: unknown): ApiError => {
  if (isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data
    if (body?.error) {
      return new ApiError(error.response?.status ?? 0, body.error.code, body.error.message, body.error.details)
    }
    if (error.response) {
      return new ApiError(error.response.status, 'HTTP_ERROR', 'Đã có lỗi xảy ra. Vui lòng thử lại.')
    }
  }
  return new ApiError(0, 'NETWORK_ERROR', 'Không kết nối được máy chủ. Vui lòng thử lại.')
}

const call = async <T>(request: () => Promise<T>): Promise<T> => {
  try {
    return await request()
  } catch (error) {
    throw toApiError(error)
  }
}

export const apiGet = <T>(url: string, params?: object): Promise<T> =>
  call(async () => (await httpClient.get<ApiResponse<T>>(url, { params })).data.data)

export const apiGetPage = <T>(url: string, params?: PaginationParams & object): Promise<Paginated<T>> =>
  call(async () => {
    const { data } = await httpClient.get<PaginatedResponse<T>>(url, { params })
    return { items: data.data, pagination: data.pagination }
  })

export const apiPost = <T>(url: string, body?: unknown): Promise<T> =>
  call(async () => (await httpClient.post<ApiResponse<T>>(url, body)).data.data)

// Multipart upload (photos…): longer timeout than the 15s default since files go through the API.
export const apiPostForm = <T>(url: string, form: FormData, timeout = 60_000): Promise<T> =>
  call(async () => (await httpClient.post<ApiResponse<T>>(url, form, { timeout })).data.data)

export const apiPatch = <T>(url: string, body?: unknown): Promise<T> =>
  call(async () => (await httpClient.patch<ApiResponse<T>>(url, body)).data.data)

export const apiPut = <T>(url: string, body?: unknown): Promise<T> =>
  call(async () => (await httpClient.put<ApiResponse<T>>(url, body)).data.data)

export const apiDelete = <T>(url: string): Promise<T> =>
  call(async () => (await httpClient.delete<ApiResponse<T>>(url)).data.data)

// Like apiPost/apiPatch/apiDelete, but also returns the backend `message` for the success toast.
export const apiSendWithMessage = <T>(
  method: 'post' | 'patch' | 'put' | 'delete',
  url: string,
  body?: unknown,
): Promise<WithMessage<T>> =>
  call(async () => {
    const { data } = await httpClient.request<ApiResponse<T>>({ method, url, data: body })
    return { data: data.data, ...(data.message ? { message: data.message } : {}) }
  })

import axios, { AxiosError } from 'axios'

import { env } from '../config/env'
import type {
  ApiErrorBody,
  ApiResponse,
  Paginated,
  PaginatedResponse,
  PaginationParams,
  WithMessage,
} from '../types/api'
import { ApiError } from './api-error'
import { getAccessToken } from './token-storage'

// One axios instance for the shared helpers below. Same base URL as httpClient (config/env.ts:
// VITE_API_BASE_URL, default /api/v1 through the Vite proxy).
export const http = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true,
  timeout: 15_000,
})

// TEMPORARY until login exists: the backend accepts these headers only when it runs with
// ALLOW_DEV_AUTH=true. Set VITE_DEV_USER_ID / VITE_DEV_ROLE in .env.local; ignored in builds.
http.interceptors.request.use((config) => {
  // Access token after login (same storage as httpClient).
  const token = getAccessToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  const devUserId = import.meta.env.VITE_DEV_USER_ID
  if (import.meta.env.DEV && devUserId) {
    config.headers.set('x-dev-user-id', devUserId)
    config.headers.set('x-dev-role', import.meta.env.VITE_DEV_ROLE ?? 'USER')
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const body = error.response?.data
    if (body && body.success === false) {
      throw new ApiError(
        error.response?.status ?? 0,
        body.error.code,
        body.error.message,
        body.error.details,
      )
    }
    throw new ApiError(
      error.response?.status ?? 0,
      'NETWORK_ERROR',
      'Không kết nối được máy chủ. Vui lòng thử lại.',
    )
  },
)

// Helpers that unwrap the envelope, so feature api.ts files return plain data.
export const apiGet = async <T>(url: string, params?: object): Promise<T> =>
  (await http.get<ApiResponse<T>>(url, { params })).data.data

export const apiGetPage = async <T>(
  url: string,
  params?: PaginationParams & object,
): Promise<Paginated<T>> => {
  const { data } = await http.get<PaginatedResponse<T>>(url, { params })
  return { items: data.data, pagination: data.pagination }
}

export const apiPost = async <T>(url: string, body?: unknown): Promise<T> =>
  (await http.post<ApiResponse<T>>(url, body)).data.data

export const apiPatch = async <T>(url: string, body?: unknown): Promise<T> =>
  (await http.patch<ApiResponse<T>>(url, body)).data.data

export const apiPut = async <T>(url: string, body?: unknown): Promise<T> =>
  (await http.put<ApiResponse<T>>(url, body)).data.data

export const apiDelete = async <T>(url: string): Promise<T> =>
  (await http.delete<ApiResponse<T>>(url)).data.data

// Like apiPost/apiPatch/apiDelete, but also returns the backend `message` for the success toast
// (e.g. "2 yêu cầu đang chạy vẫn tiếp tục"). Fallback texts belong in the feature hooks.
export const apiSendWithMessage = async <T>(
  method: 'post' | 'patch' | 'put' | 'delete',
  url: string,
  body?: unknown,
): Promise<WithMessage<T>> => {
  const { data } = await http.request<ApiResponse<T>>({ method, url, data: body })
  return { data: data.data, ...(data.message ? { message: data.message } : {}) }
}

import axios, { isAxiosError, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { env } from '../config/env'
import { clearAuthTokens, getAccessToken, getRefreshToken, replaceAuthTokens } from './token-storage'

/** Envelope phản hồi thành công của backend — xem server/docs/api-conventions.md */
export interface ApiResponse<T> {
  success: true
  data: T
  message?: string
}

interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

/**
 * How long a request may wait. The staging API (Render free plan) sleeps after 15 minutes without
 * traffic and needs about 30-50 s to wake up; with 15 s the first sign-in after a pause failed with
 * "Không thể kết nối máy chủ".
 */
export const REQUEST_TIMEOUT_MS = 60_000

export const httpClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: REQUEST_TIMEOUT_MS,
})

let wakeSent = false

/** Wakes a sleeping API as soon as the app opens, so it is ready by the time the user submits a form. */
export function wakeServer(): void {
  if (wakeSent) return
  wakeSent = true
  void axios.get(`${env.apiBaseUrl}/health`, { timeout: REQUEST_TIMEOUT_MS }).catch(() => undefined)
}

// Gắn access token (nếu đã đăng nhập) cho mọi request tới API cần xác thực
httpClient.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

interface RetriableRequest extends InternalAxiosRequestConfig {
  _retried?: boolean
}

interface RefreshedTokens {
  accessToken: string
  refreshToken: string
}

// Các API xác thực tự xử lý 401 (sai mật khẩu, refresh token hết hạn…): không làm mới token cho chúng
const isAuthEndpoint = (url = '') => /\/auth\//.test(url)

// Single-flight: mọi request nhận 401 cùng lúc chờ chung một lần gọi /auth/refresh-token
let refreshing: Promise<string> | null = null

const requestNewAccessToken = async (): Promise<string> => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new Error('NO_REFRESH_TOKEN')
  // axios thường (không qua httpClient) để không lặp lại interceptor này
  const { data } = await axios.post<ApiResponse<RefreshedTokens>>(
    `${env.apiBaseUrl}/auth/refresh-token`,
    { refreshToken },
    { timeout: REQUEST_TIMEOUT_MS },
  )
  replaceAuthTokens(data.data)
  return data.data.accessToken
}

export const refreshAccessToken = (): Promise<string> => {
  refreshing ??= requestNewAccessToken().finally(() => {
    refreshing = null
  })
  return refreshing
}

/** `?reason=` của trang đăng nhập khi phiên bị thu hồi/hết hạn hẳn: trang báo MSG58 */
export const SESSION_ENDED_REASON = 'session-ended'

/** Phiên hết hạn hẳn: xoá token rồi về trang đăng nhập (báo MSG58), đăng nhập xong quay lại đúng trang */
const redirectToLogin = () => {
  clearAuthTokens()
  const { pathname, search } = window.location
  if (pathname === '/login') return
  window.location.assign(`/login?redirect=${encodeURIComponent(pathname + search)}&reason=${SESSION_ENDED_REASON}`)
}

// Access token hết hạn (401): làm mới một lần rồi gửi lại request; làm mới thất bại thì đăng xuất
httpClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableRequest | undefined
  if (
    error.response?.status !== 401 ||
    !config ||
    config._retried ||
    isAuthEndpoint(config.url) ||
    !getRefreshToken()
  ) {
    return Promise.reject(error)
  }
  config._retried = true
  let accessToken: string
  try {
    accessToken = await refreshAccessToken()
  } catch {
    redirectToLogin()
    return Promise.reject(error)
  }
  config.headers.Authorization = `Bearer ${accessToken}`
  return httpClient(config)
})

export function getApiErrorCode(error: unknown): string | undefined {
  return isAxiosError<ApiErrorResponse>(error) ? error.response?.data?.error?.code : undefined
}

export const TIMEOUT_MESSAGE = 'Máy chủ phản hồi quá lâu (có thể đang khởi động). Vui lòng thử lại sau ít giây.'

export function getApiErrorMessage(error: unknown): string {
  if (isAxiosError<ApiErrorResponse>(error)) {
    const message = error.response?.data?.error?.message
    if (message) return message
    if (error.code === 'ECONNABORTED') return TIMEOUT_MESSAGE
    if (!error.response) return 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.'
  }
  return 'Đã có lỗi bất ngờ xảy ra. Vui lòng thử lại.'
}

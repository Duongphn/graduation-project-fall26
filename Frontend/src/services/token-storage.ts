const ACCESS_TOKEN_KEY = 'toyflow-access-token'
const REFRESH_TOKEN_KEY = 'toyflow-refresh-token'

interface StoredTokens {
  accessToken: string
  refreshToken: string
}

/** Sự kiện báo token vừa đổi trong tab hiện tại (sự kiện `storage` chỉ báo thay đổi từ tab khác) */
const TOKEN_CHANGE_EVENT = 'toyflow:access-token-change'

const notifyTokenChange = () => window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT))

/** "Ghi nhớ đăng nhập" → localStorage (giữ qua phiên), ngược lại → sessionStorage (mất khi đóng tab) */
export function saveAccessToken(token: string, remember: boolean) {
  clearAccessToken()
  ;(remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
  notifyTokenChange()
export function saveAuthTokens({ accessToken, refreshToken }: StoredTokens, remember: boolean) {
  clearAuthTokens()
  const storage = remember ? localStorage : sessionStorage
  storage.setItem(ACCESS_TOKEN_KEY, accessToken)
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY) ?? sessionStorage.getItem(REFRESH_TOKEN_KEY)
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  notifyTokenChange()
}

/** Đăng ký nghe thay đổi đăng nhập/đăng xuất (cả tab này lẫn tab khác) — dùng với useSyncExternalStore */
export function subscribeAccessToken(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === TOKEN_KEY) onChange()
  }
  window.addEventListener(TOKEN_CHANGE_EVENT, onChange)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(TOKEN_CHANGE_EVENT, onChange)
    window.removeEventListener('storage', handleStorage)
export function clearAuthTokens() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(ACCESS_TOKEN_KEY)
    storage.removeItem(REFRESH_TOKEN_KEY)
  }
}

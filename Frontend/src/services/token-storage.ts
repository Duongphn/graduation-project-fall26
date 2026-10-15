const ACCESS_TOKEN_KEY = 'toyflow-access-token'
const REFRESH_TOKEN_KEY = 'toyflow-refresh-token'

interface StoredTokens {
  accessToken: string
  refreshToken: string
}

/** "Ghi nhớ đăng nhập" → localStorage (giữ qua phiên), ngược lại → sessionStorage (mất khi đóng tab) */
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

export function clearAuthTokens() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(ACCESS_TOKEN_KEY)
    storage.removeItem(REFRESH_TOKEN_KEY)
  }
}

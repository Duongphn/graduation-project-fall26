const TOKEN_KEY = 'toyflow-access-token'

/** "Ghi nhớ đăng nhập" → localStorage (giữ qua phiên), ngược lại → sessionStorage (mất khi đóng tab) */
export function saveAccessToken(token: string, remember: boolean) {
  clearAccessToken()
  ;(remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
}

const TOKEN_KEY = 'toyflow-access-token'
const USER_KEY = 'toyflow-user'

/** Thông tin hiển thị của người đang đăng nhập, lấy từ phản hồi đăng nhập/đăng ký */
export interface StoredUser {
  id: string
  fullName: string
}

/** "Ghi nhớ đăng nhập" → localStorage (giữ qua phiên), ngược lại → sessionStorage (mất khi đóng tab) */
export function saveSession(session: { accessToken: string; user: StoredUser }, remember: boolean) {
  clearAccessToken()
  const storage = remember ? localStorage : sessionStorage
  storage.setItem(TOKEN_KEY, session.accessToken)
  storage.setItem(USER_KEY, JSON.stringify({ id: session.user.id, fullName: session.user.fullName }))
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
export function saveAuthTokens({ accessToken, refreshToken }: StoredTokens, remember: boolean) {
  clearAuthTokens()
  const storage = remember ? localStorage : sessionStorage
  storage.setItem(ACCESS_TOKEN_KEY, accessToken)
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  notifyTokenChange()
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
  notifyTokenChange()
}

/** Phiên đăng nhập cũ (trước khi lưu kèm user) trả về null: giao diện chỉ thiếu tên, không lỗi */
export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    const user = JSON.parse(raw) as Partial<StoredUser>
    return typeof user.id === 'string' && typeof user.fullName === 'string' ? { id: user.id, fullName: user.fullName } : null
  } catch {
    return null
  }
}

export function clearAccessToken() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(TOKEN_KEY)
    storage.removeItem(USER_KEY)
/** Đăng ký nghe thay đổi đăng nhập/đăng xuất (cả tab này lẫn tab khác) — dùng với useSyncExternalStore */
export function subscribeAccessToken(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === ACCESS_TOKEN_KEY) onChange()
  }
  window.addEventListener(TOKEN_CHANGE_EVENT, onChange)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(TOKEN_CHANGE_EVENT, onChange)
    window.removeEventListener('storage', handleStorage)
  }
}

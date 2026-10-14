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
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
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
  }
}

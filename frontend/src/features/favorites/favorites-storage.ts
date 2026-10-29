/**
 * Lưu danh sách đồ chơi yêu thích — TẠM THỜI ở trình duyệt vì backend chưa có API yêu thích.
 * Khi có API (vd. GET/POST/DELETE /favorites), chỉ cần thay 3 hàm read/add/remove bên dưới,
 * hook và giao diện giữ nguyên.
 */
const STORAGE_KEY = 'toyflow-favorites'
const CHANGE_EVENT = 'toyflow:favorites-change'

const EMPTY: readonly string[] = []
let cachedRaw: string | null = null
let cachedIds: readonly string[] = EMPTY

/** Danh sách id yêu thích; trả về cùng một mảng khi dữ liệu không đổi (yêu cầu của useSyncExternalStore) */
export function readFavoriteIds(): readonly string[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return EMPTY // Trình duyệt chặn storage: coi như chưa có yêu thích
  }
  if (raw === cachedRaw) return cachedIds

  cachedRaw = raw
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : []
    cachedIds = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : EMPTY
  } catch {
    cachedIds = EMPTY
  }
  return cachedIds
}

function writeFavoriteIds(ids: readonly string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Không lưu được (storage bị chặn / đầy): bỏ qua, giao diện vẫn không lỗi
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function toggleFavoriteId(id: string) {
  const ids = readFavoriteIds()
  writeFavoriteIds(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])
}

/** Nghe thay đổi ở tab này (sự kiện riêng) và tab khác (sự kiện storage) */
export function subscribeFavorites(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) onChange()
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', handleStorage)
  }
}

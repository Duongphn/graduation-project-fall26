const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })

/** "2026-10-10T02:30:00Z" → "10/10/2026, 09:30" (giờ Việt Nam theo máy người dùng) */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

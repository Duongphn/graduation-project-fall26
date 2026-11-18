const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' })

/** "2026-10-10T02:30:00Z" → "10/10/2026, 09:30" (luôn theo giờ Việt Nam) */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

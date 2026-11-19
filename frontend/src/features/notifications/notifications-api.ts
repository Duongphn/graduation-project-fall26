import { apiGet, apiGetPage, apiPatch, apiPut } from '../../services/http'
import type { PaginationParams } from '../../types/api'
import type { NotificationType } from '../../constants/domain'

export type { NotificationType }

// DTOs of /notifications (server validations/notification.validation.ts).
export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  /** Trang mà thông báo mở ra, vd. /rentals/mine/<id>; null với thông báo cũ */
  link: string | null
  isRead: boolean
  createdAt: string
}

export interface NotificationListParams extends Omit<PaginationParams, 'sortBy'> {
  sortBy?: 'createdAt'
  unreadOnly?: 'true' | 'false'
}

export interface NotificationTypeSetting {
  type: NotificationType
  /** false: thông báo quan trọng, luôn được gửi */
  canMute: boolean
  muted: boolean
  /** Có gửi kèm email */
  email: boolean
}

export interface NotificationPreferences {
  types: NotificationTypeSetting[]
}

const BASE = '/notifications'

export const notificationsApi = {
  list: (params: NotificationListParams) => apiGetPage<AppNotification>(BASE, params),
  unreadCount: () => apiGet<{ count: number }>(`${BASE}/unread-count`),
  markRead: (id: string) => apiPatch<AppNotification>(`${BASE}/${id}/read`),
  markAllRead: () => apiPatch<{ updatedCount: number }>(`${BASE}/read-all`),
  preferences: () => apiGet<NotificationPreferences>(`${BASE}/preferences`),
  savePreferences: (mutedTypes: NotificationType[]) =>
    apiPut<NotificationPreferences>(`${BASE}/preferences`, { mutedTypes }),
}

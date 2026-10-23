import { apiGet, apiGetPage, apiPatch } from '../../services/http'
import type { PaginationParams } from '../../types/api'

// DTOs of /notifications (server notifications.schemas.ts).
export type NotificationType = 'IDENTITY_REVIEWED' | 'TOY_REVIEWED' | 'DONATION_STATUS_CHANGED'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  isRead: boolean
  createdAt: string
}

export interface NotificationListParams extends Omit<PaginationParams, 'sortBy'> {
  sortBy?: 'createdAt'
  unreadOnly?: 'true' | 'false'
}

const BASE = '/notifications'

export const notificationsApi = {
  list: (params: NotificationListParams) => apiGetPage<AppNotification>(BASE, params),
  unreadCount: () => apiGet<{ count: number }>(`${BASE}/unread-count`),
  markRead: (id: string) => apiPatch<AppNotification>(`${BASE}/${id}/read`),
  markAllRead: () => apiPatch<{ updatedCount: number }>(`${BASE}/read-all`),
}

import {
  isRealtimeConnected,
  socketOrigin,
  subscribeRealtime,
  subscribeRealtimeStatus,
} from '../../services/realtime-socket'
import type { AppNotification } from './notifications-api'

// Socket.IO events of the server (interfaces/notification.ports.ts), over the shared connection
// of services/realtime-socket.ts (the chat uses the same one).
export const NOTIFICATION_EVENTS = {
  created: 'notification:new',
  unreadCount: 'notification:unread-count',
} as const

export interface NewNotificationPayload {
  notification: AppNotification
  unreadCount: number
}

export interface NotificationSocketHandlers {
  onNew: (payload: NewNotificationPayload) => void
  onUnreadCount: (count: number) => void
  /** Kết nối lại sau khi mất: tải lại thông báo để không sót (R03) */
  onReconnect: () => void
}

export { socketOrigin }

/** Nhận thông báo realtime; kết nối được giữ chung cho mọi nơi đang nghe */
export function subscribeNotificationSocket(handler: NotificationSocketHandlers): () => void {
  return subscribeRealtime({
    events: {
      [NOTIFICATION_EVENTS.created]: (payload: NewNotificationPayload) => handler.onNew(payload),
      [NOTIFICATION_EVENTS.unreadCount]: (payload: { count: number }) => handler.onUnreadCount(payload.count),
    },
    onReconnect: handler.onReconnect,
  })
}

export const subscribeSocketStatus = subscribeRealtimeStatus

export const isNotificationSocketConnected = isRealtimeConnected

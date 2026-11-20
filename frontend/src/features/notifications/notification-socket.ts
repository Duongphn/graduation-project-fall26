import { io, type Socket } from 'socket.io-client'

import { env } from '../../config/env'
import { getAccessToken, subscribeAccessToken } from '../../services/token-storage'
import type { AppNotification } from './notifications-api'

// Socket.IO events of the server (interfaces/notification.ports.ts).
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

/** Socket.IO chạy cùng máy chủ API: lấy origin của VITE_API_BASE_URL (dev: qua proxy của Vite) */
export const socketOrigin = (apiBaseUrl: string = env.apiBaseUrl): string =>
  new URL(apiBaseUrl, window.location.origin).origin

/** userId trong access token, để biết khi nào phải kết nối lại bằng tài khoản khác */
const userIdOf = (token: string | null): string | null => {
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const userId = (JSON.parse(json) as { userId?: unknown }).userId
    return typeof userId === 'string' ? userId : null
  } catch {
    return null
  }
}

const handlers = new Set<NotificationSocketHandlers>()
const statusListeners = new Set<() => void>()
let socket: Socket | null = null
let socketUserId: string | null = null
let connected = false
let hasConnected = false
let stopWatchingToken: (() => void) | null = null

const setConnected = (value: boolean) => {
  if (connected === value) return
  connected = value
  statusListeners.forEach((listener) => listener())
}

const createSocket = (): Socket => {
  const created = io(socketOrigin(), {
    autoConnect: false,
    // Đọc token mỗi lần (kết nối lại): token mới sau khi làm mới phiên được dùng ngay
    auth: (send) => send({ token: getAccessToken() ?? '' }),
  })
  created.on('connect', () => {
    setConnected(true)
    if (hasConnected) handlers.forEach((handler) => handler.onReconnect())
    hasConnected = true
  })
  created.on('disconnect', () => setConnected(false))
  created.on('connect_error', () => setConnected(false))
  created.on(NOTIFICATION_EVENTS.created, (payload: NewNotificationPayload) =>
    handlers.forEach((handler) => handler.onNew(payload)),
  )
  created.on(NOTIFICATION_EVENTS.unreadCount, (payload: { count: number }) =>
    handlers.forEach((handler) => handler.onUnreadCount(payload.count)),
  )
  return created
}

const closeSocket = () => {
  socket?.removeAllListeners()
  socket?.disconnect()
  socket = null
  socketUserId = null
  hasConnected = false
  setConnected(false)
}

/** Mở, giữ hoặc đóng kết nối theo phiên đăng nhập hiện tại */
const syncConnection = () => {
  const token = getAccessToken()
  const userId = userIdOf(token)
  if (!token || !userId || handlers.size === 0) {
    closeSocket()
    return
  }
  // Đăng nhập tài khoản khác trong cùng trình duyệt: kết nối lại vào phòng của người mới
  if (socket && socketUserId !== userId) closeSocket()
  socket ??= createSocket()
  socketUserId = userId
  // Bị máy chủ từ chối (token hết hạn) thì socket không tự thử lại: thử lại khi có token mới
  if (!socket.connected && !socket.active) socket.connect()
}

/** Nhận thông báo realtime; kết nối được giữ chung cho mọi nơi đang nghe */
export function subscribeNotificationSocket(handler: NotificationSocketHandlers): () => void {
  handlers.add(handler)
  stopWatchingToken ??= subscribeAccessToken(syncConnection)
  syncConnection()
  return () => {
    handlers.delete(handler)
    // Chuyển trang thì header được dựng lại: chờ một nhịp rồi mới đóng nếu không còn ai nghe
    setTimeout(() => {
      if (handlers.size > 0) return
      stopWatchingToken?.()
      stopWatchingToken = null
      closeSocket()
    }, 1000)
  }
}

export const subscribeSocketStatus = (listener: () => void) => {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

export const isNotificationSocketConnected = () => connected

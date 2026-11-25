import { io, type Socket } from 'socket.io-client'

import { env } from '../config/env'
import { getAccessToken, subscribeAccessToken } from './token-storage'

// The one Socket.IO connection of the web app (server sockets/socket.ts). The server checks the
// JWT at the handshake and puts the connection in the "user:<id>" room, which both the
// notifications and the chat push to, so every feature shares this connection.

type EventListener = (payload: never) => void

/** What one feature listens to: server events, and a reconnect after the connection dropped. */
export interface RealtimeSubscription {
  events?: Record<string, EventListener>
  /** Kết nối lại sau khi mất: tải lại dữ liệu để không sót sự kiện trong lúc mất kết nối */
  onReconnect?: () => void
}

/** Ack of a server event: { ok, data } or { ok: false, error } (server sockets/chat.socket.ts) */
export type AckResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } }

/**
 * emitWithAck could not get an answer. `offline`: nothing was sent (safe to retry over REST);
 * `timeout`: sent but unanswered, the server may have handled it (retrying could duplicate it).
 */
export class SocketUnavailableError extends Error {
  readonly reason: 'offline' | 'timeout'

  constructor(reason: 'offline' | 'timeout') {
    super(reason === 'offline' ? 'Chưa kết nối được máy chủ realtime.' : 'Máy chủ realtime không phản hồi.')
    this.name = 'SocketUnavailableError'
    this.reason = reason
  }
}

const ACK_TIMEOUT_MS = 10_000

/** Socket.IO chạy cùng máy chủ API: lấy origin của VITE_API_BASE_URL (dev: qua proxy của Vite) */
export const socketOrigin = (apiBaseUrl: string = env.apiBaseUrl): string =>
  new URL(apiBaseUrl, window.location.origin).origin

/** userId trong access token, để biết khi nào phải kết nối lại bằng tài khoản khác */
export const userIdOfToken = (token: string | null): string | null => {
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

const subscriptions = new Set<RealtimeSubscription>()
const statusListeners = new Set<() => void>()
let socket: Socket | null = null
let socketUserId: string | null = null
/** Events already wired on the current socket (each event is wired once, then fanned out) */
let wiredEvents = new Set<string>()
let connected = false
let hasConnected = false
let stopWatchingToken: (() => void) | null = null

const setConnected = (value: boolean) => {
  if (connected === value) return
  connected = value
  statusListeners.forEach((listener) => listener())
}

const dispatch = (event: string, payload: unknown) =>
  subscriptions.forEach((subscription) => {
    const listener = subscription.events?.[event] as ((payload: unknown) => void) | undefined
    listener?.(payload)
  })

/** Wires the events of every subscription that the current socket does not forward yet */
const wireEvents = () => {
  if (!socket) return
  for (const subscription of subscriptions) {
    for (const event of Object.keys(subscription.events ?? {})) {
      if (wiredEvents.has(event)) continue
      wiredEvents.add(event)
      socket.on(event, (payload: unknown) => dispatch(event, payload))
    }
  }
}

const createSocket = (): Socket => {
  const created = io(socketOrigin(), {
    autoConnect: false,
    // Đọc token mỗi lần (kết nối lại): token mới sau khi làm mới phiên được dùng ngay
    auth: (send) => send({ token: getAccessToken() ?? '' }),
  })
  created.on('connect', () => {
    setConnected(true)
    if (hasConnected) subscriptions.forEach((subscription) => subscription.onReconnect?.())
    hasConnected = true
  })
  created.on('disconnect', () => setConnected(false))
  created.on('connect_error', () => setConnected(false))
  return created
}

const closeSocket = () => {
  socket?.removeAllListeners()
  socket?.disconnect()
  socket = null
  socketUserId = null
  wiredEvents = new Set()
  hasConnected = false
  setConnected(false)
}

/** Mở, giữ hoặc đóng kết nối theo phiên đăng nhập hiện tại */
const syncConnection = () => {
  const token = getAccessToken()
  const userId = userIdOfToken(token)
  if (!token || !userId || subscriptions.size === 0) {
    closeSocket()
    return
  }
  // Đăng nhập tài khoản khác trong cùng trình duyệt: kết nối lại vào phòng của người mới
  if (socket && socketUserId !== userId) closeSocket()
  socket ??= createSocket()
  socketUserId = userId
  wireEvents()
  // Bị máy chủ từ chối (token hết hạn) thì socket không tự thử lại: thử lại khi có token mới
  if (!socket.connected && !socket.active) socket.connect()
}

/**
 * Nghe sự kiện realtime; kết nối được mở khi có người nghe đầu tiên và giữ chung cho mọi nơi.
 * Trả về hàm huỷ đăng ký.
 */
export function subscribeRealtime(subscription: RealtimeSubscription): () => void {
  subscriptions.add(subscription)
  stopWatchingToken ??= subscribeAccessToken(syncConnection)
  syncConnection()
  return () => {
    subscriptions.delete(subscription)
    // Chuyển trang thì header được dựng lại: chờ một nhịp rồi mới đóng nếu không còn ai nghe
    setTimeout(() => {
      if (subscriptions.size > 0) return
      stopWatchingToken?.()
      stopWatchingToken = null
      closeSocket()
    }, 1000)
  }
}

export const subscribeRealtimeStatus = (listener: () => void) => {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

export const isRealtimeConnected = () => connected

/**
 * Gửi một sự kiện và chờ ack của máy chủ. Không có kết nối hoặc quá thời gian thì ném
 * SocketUnavailableError (nơi gọi có thể chuyển sang REST); lỗi nghiệp vụ nằm trong ack `ok: false`.
 */
export function emitWithAck<T>(event: string, payload: unknown, timeoutMs = ACK_TIMEOUT_MS): Promise<AckResult<T>> {
  const current = socket
  if (!current?.connected) return Promise.reject(new SocketUnavailableError('offline'))
  return new Promise((resolve, reject) => {
    current.timeout(timeoutMs).emit(event, payload, (error: Error | null, result: AckResult<T>) => {
      if (error) reject(new SocketUnavailableError('timeout'))
      else resolve(result)
    })
  })
}

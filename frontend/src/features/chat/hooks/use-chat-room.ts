import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { ApiError, getErrorMessage } from '../../../services/api-error'
import {
  isRealtimeConnected,
  SocketUnavailableError,
  subscribeRealtimeStatus,
} from '../../../services/realtime-socket'
import { chatApi, type ChatImageInput, type ChatMessage, type SendMessageBody } from '../chat-api'
import {
  addMessageToCache,
  chatKeys,
  conversationQuery,
  flattenMessages,
  markConversationClosed,
  markMessagesReadBy,
  messagesQuery,
  useCurrentUserId,
} from '../chat-queries'
import {
  joinConversation,
  leaveConversation,
  readConversation,
  sendChatMessage,
  subscribeChatSocket,
} from '../chat-socket'

/** Tin mình vừa gửi, hiện ngay trong lúc chờ máy chủ xác nhận (optimistic) */
export interface PendingMessage {
  clientId: string
  text: string
  images: ChatImageInput[]
  /** Ảnh xem trước trên máy (object URL) */
  previews: string[]
  status: 'sending' | 'failed'
  error?: string
  createdAt: string
}

export interface OutgoingMessage {
  text: string
  images: ChatImageInput[]
  previews: string[]
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}
const isPageVisible = () => document.visibilityState === 'visible'

let clientSequence = 0
const nextClientId = () => `local-${Date.now()}-${++clientSequence}`

const toBody = ({ text, images }: Pick<PendingMessage, 'text' | 'images'>): SendMessageBody => ({
  ...(text ? { text } : {}),
  ...(images.length > 0 ? { images } : {}),
})

/**
 * Gửi qua socket (`chat:send`, có ack). Chỉ khi chưa có kết nối mới gửi bằng REST (cùng body):
 * socket đã gửi mà quá hạn chờ thì không gửi lại, vì máy chủ có thể đã lưu tin.
 */
async function deliver(conversationId: string, body: SendMessageBody): Promise<ChatMessage> {
  try {
    const ack = await sendChatMessage(conversationId, body)
    if (ack.ok) return ack.data
    const status = ack.error.code === 'CHAT_CLOSED' ? 409 : 400
    throw new ApiError(status, ack.error.code, ack.error.message, ack.error.details)
  } catch (error) {
    if (error instanceof SocketUnavailableError && error.reason === 'offline') {
      return chatApi.send(conversationId, body)
    }
    throw error
  }
}

/**
 * Một phòng chat: thông tin phòng, tin nhắn (50 tin mới nhất + trang cũ hơn), gửi optimistic,
 * đánh dấu đã đọc, vào/rời phòng trên socket. Dựng lại khi đổi phòng (component gọi được key theo id).
 */
export function useChatRoom(conversationId: string) {
  const queryClient = useQueryClient()
  const me = useCurrentUserId()
  const connected = useSyncExternalStore(subscribeRealtimeStatus, isRealtimeConnected)
  const conversation = useQuery(conversationQuery(conversationId))
  const messagesData = useInfiniteQuery(messagesQuery(conversationId))
  const [pending, setPending] = useState<PendingMessage[]>([])

  const messages = useMemo(() => flattenMessages(messagesData.data), [messagesData.data])
  const readOnly = conversation.data?.readOnly ?? false

  const markRead = useCallback(async () => {
    let readAt: string
    try {
      const ack = await readConversation(conversationId)
      if (!ack.ok) return
      readAt = ack.data.readAt
    } catch (error) {
      if (!(error instanceof SocketUnavailableError)) return
      try {
        readAt = (await chatApi.markRead(conversationId)).readAt
      } catch {
        return // Không đánh dấu được thì lần mở sau thử lại; không làm phiền người dùng
      }
    }
    if (me) markMessagesReadBy(queryClient, conversationId, me, readAt)
    void queryClient.invalidateQueries({ queryKey: chatKeys.unreadCount() })
    void queryClient.invalidateQueries({ queryKey: chatKeys.lists() })
  }, [conversationId, me, queryClient])

  // Tin mới và "đã xem" của phòng này; kết nối lại thì tải lại để không sót tin
  useEffect(
    () =>
      subscribeChatSocket({
        // Tin của người kia được đánh dấu đã đọc ở effect bên dưới (chỉ khi đang xem trang)
        onMessage: ({ conversationId: target, message }) => {
          if (target === conversationId) addMessageToCache(queryClient, message)
        },
        onRead: ({ conversationId: target, readerId, readAt }) => {
          if (target !== conversationId || readerId === me) return
          markMessagesReadBy(queryClient, conversationId, readerId, readAt)
        },
        onReconnect: () => {
          void queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
          void queryClient.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) })
        },
      }),
    [conversationId, me, queryClient],
  )

  // Vào phòng khi có kết nối (cả lần kết nối lại), rời phòng khi đóng
  useEffect(() => {
    if (!connected) return
    joinConversation(conversationId)
      .then((ack) => {
        if (ack.ok) queryClient.setQueryData(chatKeys.conversation(conversationId), ack.data)
      })
      .catch(() => undefined)
    return () => {
      leaveConversation(conversationId).catch(() => undefined)
    }
  }, [connected, conversationId, queryClient])

  // Có tin chưa đọc gửi tới mình (lúc mở phòng hoặc tin mới đến) và đang xem trang: đánh dấu đã đọc.
  // Tab đang ẩn thì chờ tới khi người dùng quay lại, để "Đã xem" của người kia là thật.
  const visible = useSyncExternalStore(subscribeVisibility, isPageVisible)
  const hasUnread = Boolean(me) && messages.some((message) => message.senderId !== me && !message.isRead)
  const readRequested = useRef(false)
  useEffect(() => {
    if (!hasUnread || !visible || readRequested.current) return
    readRequested.current = true
    void markRead().finally(() => {
      readRequested.current = false
    })
  }, [hasUnread, visible, markRead])

  // Ảnh xem trước của tin đã gửi xong hoặc bị bỏ: trả lại bộ nhớ
  const releasePreviews = (message: PendingMessage | undefined) =>
    message?.previews.forEach((url) => URL.revokeObjectURL(url))

  const run = useCallback(
    async (message: PendingMessage) => {
      try {
        const saved = await deliver(conversationId, toBody(message))
        addMessageToCache(queryClient, saved)
        setPending((list) => {
          releasePreviews(list.find((item) => item.clientId === message.clientId))
          return list.filter((item) => item.clientId !== message.clientId)
        })
        void queryClient.invalidateQueries({ queryKey: chatKeys.lists() })
      } catch (error) {
        if (error instanceof ApiError && error.code === 'CHAT_CLOSED') {
          markConversationClosed(queryClient, conversationId)
        }
        setPending((list) =>
          list.map((item) =>
            item.clientId === message.clientId
              ? { ...item, status: 'failed', error: getErrorMessage(error, 'Gửi lỗi. Vui lòng thử lại.') }
              : item,
          ),
        )
      }
    },
    [conversationId, queryClient],
  )

  const send = useCallback(
    (outgoing: OutgoingMessage) => {
      const message: PendingMessage = {
        clientId: nextClientId(),
        text: outgoing.text.trim(),
        images: outgoing.images,
        previews: outgoing.previews,
        status: 'sending',
        createdAt: new Date().toISOString(),
      }
      setPending((list) => [...list, message])
      void run(message)
    },
    [run],
  )

  const retry = useCallback(
    (clientId: string) => {
      const message = pending.find((item) => item.clientId === clientId)
      if (!message) return
      const again: PendingMessage = { ...message, status: 'sending', error: undefined }
      setPending((list) => list.map((item) => (item.clientId === clientId ? again : item)))
      void run(again)
    },
    [pending, run],
  )

  const discard = useCallback((clientId: string) => {
    setPending((list) => {
      releasePreviews(list.find((item) => item.clientId === clientId))
      return list.filter((item) => item.clientId !== clientId)
    })
  }, [])

  return {
    me,
    conversation,
    messagesQuery: messagesData,
    messages,
    pending,
    readOnly,
    hasOlder: Boolean(messagesData.hasNextPage),
    loadingOlder: messagesData.isFetchingNextPage,
    loadOlder: () => void messagesData.fetchNextPage(),
    send,
    retry,
    discard,
  }
}

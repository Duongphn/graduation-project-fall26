import {
  infiniteQueryOptions,
  queryOptions,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'

import { useApiMutation } from '../../hooks/useApiMutation'
import { useIsSignedIn } from '../../hooks/use-is-signed-in'
import { chatRoomPath } from '../../routes/paths'
import {
  isRealtimeConnected,
  subscribeRealtimeStatus,
  userIdOfToken,
} from '../../services/realtime-socket'
import { getAccessToken, subscribeAccessToken } from '../../services/token-storage'
import { chatApi, type ChatMessage, type ChatSubjectKind, type Conversation, type MessagesPage } from './chat-api'
import { CHAT_PAGE_SIZE } from './chat-schema'
import { subscribeChatSocket } from './chat-socket'

export const CONVERSATION_PAGE_SIZE = 20
/** Chỉ hỏi lại số chưa đọc định kỳ khi chưa có kết nối realtime */
export const CHAT_UNREAD_POLL_MS = 30_000

export const chatKeys = {
  all: ['chat'] as const,
  lists: () => [...chatKeys.all, 'list'] as const,
  list: (search: string) => [...chatKeys.lists(), search] as const,
  unreadCount: () => [...chatKeys.all, 'unread-count'] as const,
  conversation: (id: string) => [...chatKeys.all, 'conversation', id] as const,
  messages: (id: string) => [...chatKeys.all, 'messages', id] as const,
}

/** Người đang đăng nhập (userId trong access token), để biết tin nào là của mình */
const getCurrentUserId = () => userIdOfToken(getAccessToken())
export const useCurrentUserId = (): string | null => useSyncExternalStore(subscribeAccessToken, getCurrentUserId)

/** Hộp thư: cuộc trò chuyện có tin mới nhất lên đầu, "Xem thêm" tải trang kế */
export const conversationsQuery = (search: string) =>
  infiniteQueryOptions({
    queryKey: chatKeys.list(search),
    queryFn: ({ pageParam }) => chatApi.list({ page: pageParam, limit: CONVERSATION_PAGE_SIZE, search }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.hasNextPage ? last.pagination.page + 1 : undefined),
  })

export const chatUnreadCountQuery = queryOptions({
  queryKey: chatKeys.unreadCount(),
  queryFn: chatApi.unreadCount,
  refetchOnWindowFocus: true,
  retry: false,
})

export const conversationQuery = (id: string) =>
  queryOptions({
    queryKey: chatKeys.conversation(id),
    queryFn: () => chatApi.get(id),
    retry: false,
  })

/**
 * Tin nhắn của một phòng: trang đầu là 50 tin mới nhất, trang kế (cuộn lên) là các tin trước
 * `nextCursor`. pages[0] luôn là trang mới nhất; tin realtime được nối vào cuối pages[0].
 */
export const messagesQuery = (id: string) =>
  infiniteQueryOptions({
    queryKey: chatKeys.messages(id),
    queryFn: ({ pageParam }) =>
      chatApi.messages(id, { limit: CHAT_PAGE_SIZE, ...(pageParam ? { before: pageParam } : {}) }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : null),
    // Tin mới đến qua socket; tải lại toàn bộ chỉ khi kết nối lại (useChatRoom)
    staleTime: Infinity,
  })

type MessagesData = InfiniteData<MessagesPage, unknown>

/** Tin nhắn cũ → mới của mọi trang đã tải */
export const flattenMessages = (data: MessagesData | undefined): ChatMessage[] =>
  data ? [...data.pages].reverse().flatMap((page) => page.items) : []

/** Thêm một tin vào phòng đang có trong cache, bỏ qua nếu đã có (tin của mình về lại qua socket) */
export function addMessageToCache(queryClient: QueryClient, message: ChatMessage) {
  queryClient.setQueryData<MessagesData>(chatKeys.messages(message.conversationId), (data) => {
    if (!data) return data
    if (data.pages.some((page) => page.items.some((item) => item.id === message.id))) return data
    const [newest, ...older] = data.pages
    if (!newest) return data
    return { ...data, pages: [{ ...newest, items: [...newest.items, message] }, ...older] }
  })
}

/**
 * `readerId` vừa đọc phòng: các tin gửi tới người đó thành đã đọc. Người kia đọc thì tin của mình
 * hiện "Đã xem"; mình đọc thì tin nhận được thôi tính là chưa đọc.
 */
export function markMessagesReadBy(queryClient: QueryClient, conversationId: string, readerId: string, readAt: string) {
  queryClient.setQueryData<MessagesData>(chatKeys.messages(conversationId), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.senderId !== readerId && !item.isRead ? { ...item, isRead: true, readAt } : item,
            ),
          })),
        }
      : data,
  )
}

/** Phòng vừa bị máy chủ báo CHAT_CLOSED: chuyển ngay sang chỉ xem rồi tải lại cho chắc */
export function markConversationClosed(queryClient: QueryClient, conversationId: string) {
  queryClient.setQueryData<Conversation>(chatKeys.conversation(conversationId), (data) =>
    data ? { ...data, readOnly: true } : data,
  )
  void queryClient.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) })
  void queryClient.invalidateQueries({ queryKey: chatKeys.lists() })
}

/**
 * Hộp thư và số chưa đọc theo dõi realtime: tin mới hoặc đã đọc ở bất kỳ phòng nào làm tải lại
 * danh sách và số trên header. Trả về đã kết nối hay chưa.
 */
export function useChatInboxRealtime(): boolean {
  const queryClient = useQueryClient()

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.unreadCount() })
      void queryClient.invalidateQueries({ queryKey: chatKeys.lists() })
    }
    return subscribeChatSocket({ onMessage: refresh, onRead: refresh, onReconnect: refresh })
  }, [queryClient])

  return useSyncExternalStore(subscribeRealtimeStatus, isRealtimeConnected)
}

/** Số tin chưa đọc trên icon Tin nhắn: đẩy qua socket, hỏi lại 30 giây một lần khi mất kết nối */
export function useChatUnreadCount(): number {
  const connected = useChatInboxRealtime()
  const signedIn = useIsSignedIn()
  const query = useQuery({
    ...chatUnreadCountQuery,
    enabled: signedIn,
    refetchInterval: connected || !signedIn ? false : CHAT_UNREAD_POLL_MS,
  })
  return signedIn ? (query.data?.count ?? 0) : 0
}

/** Mở (hoặc tạo) phòng về một tin đăng hay một đơn rồi chuyển tới phòng đó */
export function useOpenConversation() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ kind, id }: { kind: ChatSubjectKind; id: string }) => chatApi.open(kind, id),
    onSuccess: ({ conversation, created }) => {
      queryClient.setQueryData(chatKeys.conversation(conversation.id), conversation)
      if (created) void queryClient.invalidateQueries({ queryKey: chatKeys.lists() })
      navigate(chatRoomPath(conversation.id))
    },
  })
}

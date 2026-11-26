import { emitWithAck, subscribeRealtime, type AckResult } from '../../services/realtime-socket'
import type { ChatMessage, Conversation, SendMessageBody } from './chat-api'

// Chat events over the shared Socket.IO connection (server sockets/chat.socket.ts,
// constants/chat.ts chatSocketEvents). New messages and read receipts reach the "user:<id>" room,
// so the inbox and the header badge get them without joining a conversation room.

export const CHAT_EVENTS = {
  join: 'chat:join',
  leave: 'chat:leave',
  send: 'chat:send',
  read: 'chat:read',
  message: 'chat:message',
} as const

export interface ChatMessageEvent {
  conversationId: string
  message: ChatMessage
}

export interface ChatReadEvent {
  conversationId: string
  readerId: string
  readAt: string
}

export interface ChatSocketHandlers {
  onMessage?: (event: ChatMessageEvent) => void
  onRead?: (event: ChatReadEvent) => void
  onReconnect?: () => void
}

export function subscribeChatSocket({ onMessage, onRead, onReconnect }: ChatSocketHandlers): () => void {
  return subscribeRealtime({
    events: {
      [CHAT_EVENTS.message]: (payload: ChatMessageEvent) => onMessage?.(payload),
      [CHAT_EVENTS.read]: (payload: ChatReadEvent) => onRead?.(payload),
    },
    onReconnect,
  })
}

export const joinConversation = (conversationId: string) =>
  emitWithAck<Conversation>(CHAT_EVENTS.join, { conversationId })

export const leaveConversation = (conversationId: string) =>
  emitWithAck<null>(CHAT_EVENTS.leave, { conversationId })

export const sendChatMessage = (conversationId: string, body: SendMessageBody): Promise<AckResult<ChatMessage>> =>
  emitWithAck<ChatMessage>(CHAT_EVENTS.send, { conversationId, ...body })

export const readConversation = (conversationId: string) =>
  emitWithAck<{ updatedCount: number; readAt: string }>(CHAT_EVENTS.read, { conversationId })

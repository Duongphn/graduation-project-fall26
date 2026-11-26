import { apiGet, apiGetPage, apiPatch, apiPost } from '../../services/http'

// DTOs and REST calls of /conversations (UC25). Shapes follow server validations/chat.validation.ts.

export type ChatSubjectKind = 'TOY' | 'RENTAL_ORDER' | 'PURCHASE_ORDER'
export type MaskedContactKind = 'PHONE' | 'EMAIL' | 'LINK' | 'BANK_ACCOUNT'

export interface ChatPerson {
  id: string
  fullName: string
  avatarUrl: string | null
}

export interface Conversation {
  id: string
  subject: {
    kind: ChatSubjectKind
    /** Mã tin đăng hoặc mã đơn */
    id: string
    /** Mã đơn (vd. RO-20261118-0001); null với chat về tin đăng */
    code: string | null
    status: string | null
  }
  toy: { id: string; title: string; imageUrl: string | null } | null
  counterpart: ChatPerson | null
  lastMessage: {
    id: string
    senderId: string
    preview: string
    imageCount: number
    sentAt: string
  } | null
  unreadCount: number
  /** Đơn đã kết thúc quá 7 ngày: chỉ xem, không gửi được (CHAT_CLOSED) */
  readOnly: boolean
  /** Thời điểm chat của đơn đã kết thúc sẽ chuyển sang chỉ xem; null khi đơn còn chạy */
  closesAt: string | null
  createdAt: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  /** Server đã che thông tin liên hệ thành "***" */
  text: string
  /** Link ký sống 1 giờ; null khi máy chủ không có Cloudinary */
  images: { url: string | null }[]
  /** true: có thông tin liên hệ bị ẩn, hiện cảnh báo MSG41 */
  masked: boolean
  maskedKinds: MaskedContactKind[]
  isRead: boolean
  readAt: string | null
  createdAt: string
}

export interface MessagesPage {
  /** Cũ → mới trong một trang */
  items: ChatMessage[]
  hasMore: boolean
  /** Truyền vào `before` để tải trang cũ hơn; null khi đã tới đầu */
  nextCursor: string | null
}

/** Ảnh private CHAT_IMAGE đã tải lên Cloudinary: chỉ gửi publicId + format, không gửi url */
export interface ChatImageInput {
  publicId: string
  format: string
}

export interface SendMessageBody {
  text?: string
  images?: ChatImageInput[]
}

export interface OpenConversationResult {
  conversation: Conversation
  created: boolean
}

export interface ConversationListParams {
  page: number
  limit: number
  search?: string
}

/** Tên hiển thị của người kia (tài khoản đã bị xoá thì không còn tên) */
export const counterpartName = (person: ChatPerson | null) => person?.fullName ?? 'Người dùng ToyFlow'

const BASE = '/conversations'

export const chatApi = {
  open: (kind: ChatSubjectKind, id: string) => apiPost<OpenConversationResult>(BASE, { kind, id }),
  list: ({ search, ...params }: ConversationListParams) =>
    apiGetPage<Conversation>(BASE, { ...params, ...(search ? { search } : {}) }),
  unreadCount: () => apiGet<{ count: number }>(`${BASE}/unread-count`),
  get: (conversationId: string) => apiGet<Conversation>(`${BASE}/${conversationId}`),
  messages: (conversationId: string, params: { before?: string; limit?: number }) =>
    apiGet<MessagesPage>(`${BASE}/${conversationId}/messages`, params),
  send: (conversationId: string, body: SendMessageBody) =>
    apiPost<ChatMessage>(`${BASE}/${conversationId}/messages`, body),
  markRead: (conversationId: string) =>
    apiPatch<{ updatedCount: number; readAt: string }>(`${BASE}/${conversationId}/read`),
}

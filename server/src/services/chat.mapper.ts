import {
  CHAT_CLOSE_AFTER_DAYS,
  CHAT_FINAL_ORDER_STATUSES,
  CHAT_IMAGE_URL_TTL_SECONDS,
  CHAT_PREVIEW_MAX,
  type ChatOrderKind,
} from '../constants/chat.js';
import type {
  ChatOrder,
  ChatToy,
  ChatUser,
  ConversationRecord,
  MessageRecord,
} from '../repositories/chat.repository.js';
import { buildPrivateImageUrl } from '../utils/cloudinary-signing.js';
import { toIsoString } from '../utils/dates.js';
import type { ChatMessageDto, ConversationDto } from '../validations/chat.validation.js';

// Database documents -> chat DTOs (UC25).

const DAY_MS = 24 * 60 * 60 * 1000;

/** The related records of a page of conversations, loaded in one query per collection. */
export interface ChatRelations {
  users: Map<string, ChatUser>;
  toys: Map<string, ChatToy>;
  orders: Map<string, ChatOrder>;
}

export const orderRefOf = (
  conversation: ConversationRecord,
): { kind: ChatOrderKind; id: string } | null =>
  conversation.context?.kind && conversation.context.id
    ? { kind: conversation.context.kind, id: String(conversation.context.id) }
    : null;

const orderKey = (ref: { kind: ChatOrderKind; id: string }) => `${ref.kind}:${ref.id}`;

export const orderOf = (
  conversation: ConversationRecord,
  orders: Map<string, ChatOrder>,
): ChatOrder | undefined => {
  const ref = orderRefOf(conversation);
  return ref ? orders.get(orderKey(ref)) : undefined;
};

/**
 * When the chat of an ended order becomes read-only: 7 days after the order reached a final
 * status (its last update). Null while the order still runs, and for listing chats.
 */
export const closesAtOf = (order: ChatOrder | undefined): Date | null => {
  if (!order) return null;
  const final = CHAT_FINAL_ORDER_STATUSES[order.kind].includes(order.status.toUpperCase());
  return final ? new Date(order.updatedAt.getTime() + CHAT_CLOSE_AFTER_DAYS * DAY_MS) : null;
};

export const isReadOnly = (order: ChatOrder | undefined, now: Date): boolean => {
  const closesAt = closesAtOf(order);
  return closesAt !== null && now.getTime() >= closesAt.getTime();
};

export const counterpartIdOf = (conversation: ConversationRecord, viewerId: string) =>
  conversation.participants.map((p) => String(p.userId)).find((id) => id !== viewerId);

export const isParticipant = (conversation: ConversationRecord, userId: string): boolean =>
  conversation.participants.some((p) => String(p.userId) === userId);

export const previewOf = (text: string): string =>
  text.length <= CHAT_PREVIEW_MAX ? text : `${text.slice(0, CHAT_PREVIEW_MAX - 1).trimEnd()}…`;

export const toConversationDto = (
  conversation: ConversationRecord,
  viewerId: string,
  relations: ChatRelations,
  unreadCount: number,
  now: Date,
): ConversationDto => {
  const ref = orderRefOf(conversation);
  const order = orderOf(conversation, relations.orders);
  const toyId = conversation.toyId ? String(conversation.toyId) : undefined;
  const toy = toyId ? relations.toys.get(toyId) : undefined;
  const counterpartId = counterpartIdOf(conversation, viewerId);
  const counterpart = counterpartId ? relations.users.get(counterpartId) : undefined;
  const last = conversation.lastMessage;
  const closesAt = closesAtOf(order);

  return {
    id: String(conversation._id),
    subject: ref
      ? { kind: ref.kind, id: ref.id, code: order?.code ?? null, status: order?.status ?? null }
      : { kind: 'TOY', id: toyId ?? '', code: null, status: null },
    toy: toy
      ? { id: String(toy._id), title: toy.title, imageUrl: toy.images?.[0]?.url ?? null }
      : null,
    counterpart: counterpart
      ? {
          id: String(counterpart._id),
          fullName: counterpart.fullName,
          avatarUrl: counterpart.avatar ?? null,
        }
      : null,
    lastMessage:
      last && conversation.lastMessageAt
        ? {
            id: String(last.messageId),
            senderId: String(last.senderId),
            preview: last.preview,
            imageCount: last.imageCount,
            sentAt: conversation.lastMessageAt.toISOString(),
          }
        : null,
    unreadCount,
    readOnly: isReadOnly(order, now),
    closesAt: toIsoString(closesAt),
    createdAt: conversation.createdAt.toISOString(),
  };
};

/** "toyflow/chat/u/abc" + "jpg" -> "toyflow/chat/u/abc.jpg" */
export const encodeImage = (image: { publicId: string; format: string }): string =>
  `${image.publicId}.${image.format.toLowerCase()}`;

const signedImageUrl = (stored: string): string | null => {
  const dot = stored.lastIndexOf('.');
  if (dot <= 0) return null;
  return (
    buildPrivateImageUrl(
      { publicId: stored.slice(0, dot), format: stored.slice(dot + 1) },
      { ttlSeconds: CHAT_IMAGE_URL_TTL_SECONDS },
    )?.url ?? null
  );
};

export const toMessageDto = (message: MessageRecord): ChatMessageDto => ({
  id: String(message._id),
  conversationId: String(message.conversationId),
  senderId: String(message.senderId),
  text: message.content ?? '',
  images: (message.images ?? []).map((stored) => ({ url: signedImageUrl(stored) })),
  masked: Boolean(message.hasSensitiveInfo),
  maskedKinds: message.maskedKinds ?? [],
  isRead: message.isRead,
  readAt: toIsoString(message.readAt),
  createdAt: message.createdAt.toISOString(),
});

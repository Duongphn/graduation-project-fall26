import type { Types } from 'mongoose';

import { chatSocketEvents } from '../constants/chat.js';
import type { ChatRealtime } from '../interfaces/chat.ports.js';
import type { Clock } from '../interfaces/rental-order.ports.js';
import * as repository from '../repositories/chat.repository.js';
import type { ChatOrder, ConversationRecord } from '../repositories/chat.repository.js';
import { writeAuditLog } from '../repositories/audit-log.repository.js';
import { maskContactDetails } from '../utils/contact-details.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../utils/http-errors.js';
import { accentInsensitivePattern, escapeRegex } from '../utils/text.js';
import { toSkipLimit } from '../utils/response.js';
import {
  CHAT_IMAGE_PATTERN,
  type ChatMessageDto,
  type ConversationDto,
  type ListConversationsQuery,
  type ListMessagesQuery,
  type MessagesPageDto,
  type OpenConversationBody,
  type SendMessageBody,
} from '../validations/chat.validation.js';
import { notifyNewChatMessage } from './chat.notifications.js';
import {
  counterpartIdOf,
  encodeImage,
  isParticipant,
  isReadOnly,
  orderRefOf,
  previewOf,
  toConversationDto,
  toMessageDto,
  type ChatRelations,
} from './chat.mapper.js';

// Chat with User (UC25): two users talk about a visible listing (before ordering) or about an
// order they are both parties of. Messages are masked with the GB-11 patterns before they are
// stored, pushed over the shared Socket.IO connection, and an offline recipient gets an in-app
// notification. An order chat is read-only 7 days after the order ends.

export interface ChatServiceDeps {
  realtime: ChatRealtime;
  clock: Clock;
}

export interface MarkReadResult {
  updatedCount: number;
  readAt: string;
}

/** Payload of the `chat:read` event (read receipt) sent to the other party. */
export interface ChatReadReceipt {
  conversationId: string;
  readerId: string;
  readAt: string;
}

const conversationNotFound = () =>
  notFound('CONVERSATION_NOT_FOUND', 'Không tìm thấy cuộc trò chuyện.');

const orderNotFound = (kind: ChatOrder['kind']) =>
  kind === 'RENTAL_ORDER'
    ? notFound('RENTAL_NOT_FOUND', 'Không tìm thấy đơn thuê.')
    : notFound('ORDER_NOT_FOUND', 'Không tìm thấy đơn mua.');

export class ChatService {
  public constructor(private readonly deps: ChatServiceDeps) {}

  /** Opens the chat of a listing or an order, creating it on first use. */
  public async openConversation(
    userId: string,
    body: OpenConversationBody,
  ): Promise<{ conversation: ConversationDto; created: boolean }> {
    let result: { conversation: ConversationRecord; created: boolean };
    if (body.kind === 'TOY') {
      const toy = await repository.findToy(body.id);
      // Only a visible (approved, not hidden) listing can be asked about.
      if (!toy || toy.status !== 'active') {
        throw notFound('TOY_NOT_FOUND', 'Đồ chơi không tồn tại hoặc không khả dụng.');
      }
      if (String(toy.ownerId) === userId) {
        throw badRequest('CHAT_WITH_SELF', 'Bạn không thể nhắn tin với chính mình.');
      }
      result = await repository.findOrCreateListingConversation(toy, userId);
    } else {
      const order = await repository.findOrder(body.kind, body.id);
      if (!order) throw orderNotFound(body.kind);
      if (!order.partyIds.includes(userId)) {
        throw forbidden('Chỉ hai bên của đơn mới xem được cuộc trò chuyện này.');
      }
      if (order.partyIds[0] === order.partyIds[1]) {
        throw badRequest('CHAT_WITH_SELF', 'Bạn không thể nhắn tin với chính mình.');
      }
      result = await repository.findOrCreateOrderConversation(order);
    }
    const [conversation] = await this.toDtos([result.conversation], userId);
    return { conversation: conversation as ConversationDto, created: result.created };
  }

  /** The caller's conversations, most recent message first (R03 (1), (2)). */
  public async listConversations(userId: string, query: ListConversationsQuery) {
    const filter: repository.InboxFilter = {};
    if (query.search) {
      const [counterpartIds, orderIds] = await Promise.all([
        repository.findUserIdsByName(accentInsensitivePattern(query.search)),
        repository.findOrderIdsByCode(userId, escapeRegex(query.search)),
      ]);
      filter.counterpartIds = counterpartIds;
      filter.orderIds = orderIds;
    }
    const { items, totalItems } = await repository.findInbox(userId, filter, toSkipLimit(query));
    return { items: await this.toDtos(items, userId), totalItems };
  }

  public async getConversation(userId: string, conversationId: string): Promise<ConversationDto> {
    const conversation = await this.loadForParticipant(userId, conversationId);
    const [dto] = await this.toDtos([conversation], userId);
    return dto as ConversationDto;
  }

  public async countUnread(userId: string): Promise<{ count: number }> {
    return { count: await repository.countUnreadTotal(userId) };
  }

  /** One page of the room history: the latest 50, then older ones with `before` (R03 (5)). */
  public async listMessages(
    userId: string,
    conversationId: string,
    query: ListMessagesQuery,
  ): Promise<MessagesPageDto> {
    const conversation = await this.loadForParticipant(userId, conversationId);
    let before = null;
    if (query.before) {
      before = await repository.findMessageIn(conversation._id, query.before);
      if (!before) throw notFound('MESSAGE_NOT_FOUND', 'Không tìm thấy tin nhắn.');
    }
    // One extra row tells whether older messages exist.
    const rows = await repository.findMessagesPage(conversation._id, before, query.limit + 1);
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const oldest = page[page.length - 1];
    return {
      items: page.reverse().map(toMessageDto),
      hasMore,
      nextCursor: hasMore && oldest ? String(oldest._id) : null,
    };
  }

  /**
   * Sends a text and/or image message (R03 (6)-(9)): masks contact details (GB-11), stores the
   * message, logs the masking, pushes it to both parties and notifies an offline recipient.
   */
  public async sendMessage(
    userId: string,
    conversationId: string,
    body: SendMessageBody,
  ): Promise<ChatMessageDto> {
    const conversation = await this.loadForParticipant(userId, conversationId);
    await this.assertWritable(conversation);
    const images = body.images ?? [];
    const foreign = images.filter(
      (image) => CHAT_IMAGE_PATTERN.exec(image.publicId)?.[1] !== userId,
    );
    if (foreign.length > 0) {
      throw unprocessable(
        'CHAT_IMAGE_NOT_OWNED',
        'Ảnh trong tin nhắn phải do chính bạn tải lên với mục đích CHAT_IMAGE.',
        { publicIds: foreign.map((image) => image.publicId) },
      );
    }

    // Line breaks are kept; only the outer spaces are trimmed.
    const masked = maskContactDetails((body.text ?? '').normalize('NFC').trim());
    const message = await repository.insertMessage({
      conversationId: conversation._id,
      senderId: userId,
      content: masked.text,
      images: images.map(encodeImage),
      maskedKinds: masked.kinds,
    });
    await repository.setLastMessage(conversation._id, message, previewOf(masked.text));
    if (masked.kinds.length > 0) await this.logMasking(userId, message._id);

    const dto = toMessageDto(message);
    const recipientId = counterpartIdOf(conversation, userId);
    this.deps.realtime.publish(
      [userId, ...(recipientId ? [recipientId] : [])],
      chatSocketEvents.message,
      { conversationId, message: dto },
    );
    if (recipientId) {
      await this.notifyIfOffline(conversation._id, userId, recipientId, masked.text, images.length);
    }
    return dto;
  }

  /** Marks the other party's messages as read and sends them a read receipt. */
  public async markRead(userId: string, conversationId: string): Promise<MarkReadResult> {
    const conversation = await this.loadForParticipant(userId, conversationId);
    const readAt = this.deps.clock.now();
    const updatedCount = await repository.markReadFor(conversation._id, userId, readAt);
    const recipientId = counterpartIdOf(conversation, userId);
    if (updatedCount > 0 && recipientId) {
      const receipt: ChatReadReceipt = {
        conversationId,
        readerId: userId,
        readAt: readAt.toISOString(),
      };
      this.deps.realtime.publish([recipientId, userId], chatSocketEvents.read, receipt);
    }
    return { updatedCount, readAt: readAt.toISOString() };
  }

  // ---- helpers ------------------------------------------------------------------------------

  /** Only the two participants can read or write a conversation (R03 IV.2 Role-based access). */
  private async loadForParticipant(
    userId: string,
    conversationId: string,
  ): Promise<ConversationRecord> {
    const conversation = await repository.findConversation(conversationId);
    if (!conversation) throw conversationNotFound();
    if (!isParticipant(conversation, userId)) {
      throw forbidden('Bạn không tham gia cuộc trò chuyện này.');
    }
    return conversation;
  }

  private async assertWritable(conversation: ConversationRecord): Promise<void> {
    const ref = orderRefOf(conversation);
    if (!ref) return;
    const order = await repository.findOrder(ref.kind, ref.id);
    if (isReadOnly(order, this.deps.clock.now())) {
      throw conflict(
        'CHAT_CLOSED',
        'Đơn đã kết thúc nên cuộc trò chuyện chỉ còn xem được, không gửi thêm tin nhắn.',
      );
    }
  }

  // The violation is recorded (R03 IV.2 Off-platform contact protection): who, which message,
  // when. The hidden text itself is never stored or logged.
  private async logMasking(senderId: string, messageId: Types.ObjectId): Promise<void> {
    try {
      await writeAuditLog({
        actorId: senderId,
        action: 'chat.contact_masked',
        target: { kind: 'MESSAGE', id: String(messageId) },
      });
    } catch (error) {
      console.error(
        `[chat] Masking log of message ${String(messageId)} not written: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // An offline recipient gets one in-app notification per unread streak: only for the first
  // unread message of this sender, so a burst of messages is not a burst of notifications.
  private async notifyIfOffline(
    conversationId: Types.ObjectId,
    senderId: string,
    recipientId: string,
    text: string,
    imageCount: number,
  ): Promise<void> {
    try {
      if (await this.deps.realtime.isUserOnline(recipientId)) return;
      if ((await repository.countUnreadFrom(conversationId, senderId)) !== 1) return;
      const sender = (await repository.findUsers([senderId])).get(senderId);
      notifyNewChatMessage({
        recipientId,
        senderId,
        senderName: sender?.fullName ?? 'Người dùng ToyFlow',
        conversationId: String(conversationId),
        preview: previewOf(text),
        imageCount,
      });
    } catch (error) {
      console.error(
        `[chat] Offline notification not sent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async toDtos(
    conversations: ConversationRecord[],
    viewerId: string,
  ): Promise<ConversationDto[]> {
    const orderRefs = conversations.flatMap((c) => orderRefOf(c) ?? []);
    const counterpartIds = conversations.flatMap((c) => counterpartIdOf(c, viewerId) ?? []);
    const toyIds = conversations.flatMap((c) => (c.toyId ? [String(c.toyId)] : []));
    const [users, toys, orders, unread] = await Promise.all([
      repository.findUsers(counterpartIds),
      repository.findToys(toyIds),
      repository.findOrders(orderRefs),
      repository.countUnreadByConversation(
        viewerId,
        conversations.map((c) => c._id),
      ),
    ]);
    const relations: ChatRelations = { users, toys, orders };
    const now = this.deps.clock.now();
    return conversations.map((conversation) =>
      toConversationDto(
        conversation,
        viewerId,
        relations,
        unread.get(String(conversation._id)) ?? 0,
        now,
      ),
    );
  }
}

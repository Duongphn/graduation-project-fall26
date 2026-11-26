// Chat with User (UC25, R03 III.6.3.1 Chat screen).

/** What a conversation is about: a toy listing (before ordering) or an order. */
export const chatSubjectKinds = ['TOY', 'RENTAL_ORDER', 'PURCHASE_ORDER'] as const;
export type ChatSubjectKind = (typeof chatSubjectKinds)[number];

/** Order kinds, stored in conversations.context.kind (one conversation per order). */
export const chatOrderKinds = ['RENTAL_ORDER', 'PURCHASE_ORDER'] as const;
export type ChatOrderKind = (typeof chatOrderKinds)[number];

/** Kinds of contact details hidden in a chat message (GB-11, plus bank account numbers). */
export const maskedContactKinds = ['PHONE', 'EMAIL', 'LINK', 'BANK_ACCOUNT'] as const;
export type MaskedContactKind = (typeof maskedContactKinds)[number];

/** R03 (9): max 1000 characters per message. */
export const CHAT_TEXT_MAX = 1000;
/** R03 (8): up to 5 images per message (JPG, PNG, WebP, max 5 MB each, checked on upload). */
export const CHAT_IMAGES_MAX = 5;
/** R03 (5): the 50 most recent messages load when the room opens. */
export const CHAT_PAGE_SIZE = 50;
/** R03 (2): the conversation search field takes at most 50 characters. */
export const CHAT_SEARCH_MAX = 50;
/** Length of the last-message preview in the inbox and the offline notification. */
export const CHAT_PREVIEW_MAX = 100;

/**
 * An order chat becomes read-only this many days after the order ends (R03 Conversation:
 * Open -> Closed some time after the order ends; III.4.1.2 (3): the Message button is hidden
 * once the booking has been completed for more than 7 days).
 */
export const CHAT_CLOSE_AFTER_DAYS = 7;

/** Order statuses after which nothing more happens on the order (case-insensitive). */
export const CHAT_FINAL_ORDER_STATUSES: Record<ChatOrderKind, readonly string[]> = {
  RENTAL_ORDER: ['COMPLETED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
  PURCHASE_ORDER: ['COMPLETED', 'CANCELLED'],
};

/** Signed links to chat images (private uploads) stay valid for one hour. */
export const CHAT_IMAGE_URL_TTL_SECONDS = 60 * 60;

/** Socket.IO events of the chat (same connection as the notifications). */
export const chatSocketEvents = {
  join: 'chat:join',
  leave: 'chat:leave',
  send: 'chat:send',
  read: 'chat:read',
  message: 'chat:message',
} as const;

/** Socket.IO room of one conversation (the user rooms are in sockets/socket.ts). */
export const conversationRoom = (conversationId: string): string =>
  `conversation:${conversationId}`;

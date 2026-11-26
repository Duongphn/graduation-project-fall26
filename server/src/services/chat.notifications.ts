import { notify } from '../utils/notify.js';

// The notification of a chat message for an offline recipient (UC25), sent through the shared
// notify(): type CHAT_MESSAGE (in-app only, the user can mute it), opening the conversation.

export interface ChatMessageNotice {
  recipientId: string;
  senderId: string;
  senderName: string;
  conversationId: string;
  /** Masked text preview, or empty for an image-only message. */
  preview: string;
  imageCount: number;
}

const MAX_NAME = 80;

const shorten = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/** Web app path of a conversation. */
export const chatLink = (conversationId: string): string => `/chat/${conversationId}`;

/** Title and body of the notification (Vietnamese). */
export const renderChatMessage = (notice: ChatMessageNotice) => {
  const name = shorten(notice.senderName, MAX_NAME);
  const content = notice.preview || (notice.imageCount > 0 ? `[${notice.imageCount} ảnh]` : '');
  const summary = content ? `${name}: ${content}` : `${name} đã gửi cho bạn một tin nhắn.`;
  return {
    title: `Tin nhắn mới từ ${name}`,
    body: `${summary} Mở Tin nhắn trên ToyFlow để trả lời.`,
  };
};

export const notifyNewChatMessage = (notice: ChatMessageNotice): void => {
  notify({
    type: 'CHAT_MESSAGE',
    to: notice.recipientId,
    ...renderChatMessage(notice),
    link: chatLink(notice.conversationId),
    email: false,
    actorId: notice.senderId,
  });
};

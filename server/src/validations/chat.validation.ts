import {
  CHAT_IMAGES_MAX,
  CHAT_PAGE_SIZE,
  CHAT_SEARCH_MAX,
  CHAT_TEXT_MAX,
  chatSubjectKinds,
  maskedContactKinds,
} from '../constants/chat.js';
import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQuerySchema,
  privateImageInputSchema,
} from './common.validation.js';
import { z } from './zod.js';

// Request and response schemas of the chat (UC25, R03 III.6.3.1).

/**
 * Chat images are private uploads with the CHAT_IMAGE purpose: the uploads feature signs the
 * public_id "toyflow/chat/<uploader id>/<random>". The service also checks that the uploader is
 * the sender.
 */
export const CHAT_IMAGE_PATTERN = /^toyflow\/chat\/([a-f0-9]{24})\/[A-Za-z0-9_-]{1,64}$/;

const chatImageInputSchema = privateImageInputSchema
  .extend({
    format: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^(?:jpe?g|png|webp)$/, 'Chỉ nhận ảnh JPG, PNG hoặc WebP.'),
  })
  .refine((image) => CHAT_IMAGE_PATTERN.test(image.publicId), {
    message: 'Ảnh trong tin nhắn phải được tải lên với mục đích CHAT_IMAGE.',
  })
  .openapi('ChatImageInput');

// ---- Inputs ----------------------------------------------------------------------------------

export const openConversationBodySchema = z
  .object({
    kind: z.enum(chatSubjectKinds).openapi({
      description:
        'TOY: chat with the owner about a visible listing (before ordering). RENTAL_ORDER / ' +
        'PURCHASE_ORDER: the chat of that order (caller must be one of its two parties).',
    }),
    id: objectIdSchema.openapi({ description: 'The toy id or the order id.' }),
  })
  .strict()
  .openapi('OpenConversationRequest');
export type OpenConversationBody = z.infer<typeof openConversationBodySchema>;

export const listConversationsQuerySchema = paginationQuerySchema
  .pick({ page: true, limit: true })
  .extend({
    search: z
      .string()
      .trim()
      .max(CHAT_SEARCH_MAX)
      .optional()
      .openapi({ description: 'Counterpart name or order code (R03 (2)).', example: 'Lan' }),
  })
  .strict();
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const listMessagesQuerySchema = z
  .object({
    before: objectIdSchema.optional().openapi({
      description: 'nextCursor of the previous page: loads the messages sent before it.',
    }),
    limit: z.coerce.number().int().min(1).max(CHAT_PAGE_SIZE).default(CHAT_PAGE_SIZE),
  })
  .strict();
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export const sendMessageBodySchema = z
  .object({
    text: z
      .string()
      .max(CHAT_TEXT_MAX, `Tin nhắn tối đa ${CHAT_TEXT_MAX} ký tự.`)
      .optional()
      .openapi({ example: 'Bạn cho mình hỏi bộ Lego còn đủ mảnh không?' }),
    images: z
      .array(chatImageInputSchema)
      .max(CHAT_IMAGES_MAX, `Tối đa ${CHAT_IMAGES_MAX} ảnh mỗi tin nhắn.`)
      .optional(),
  })
  .strict()
  .refine((body) => Boolean(body.text?.trim()) || (body.images?.length ?? 0) > 0, {
    message: 'Tin nhắn cần có nội dung hoặc ảnh.',
    path: ['text'],
  })
  .openapi('SendMessageRequest');
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;

export const conversationIdParamsSchema = z.object({ conversationId: objectIdSchema });
export type ConversationIdParams = z.infer<typeof conversationIdParamsSchema>;

// ---- Responses -------------------------------------------------------------------------------

const personSchema = z
  .object({
    id: objectIdSchema,
    fullName: z.string(),
    avatarUrl: z.string().nullable(),
  })
  .openapi('ChatPerson');

export const conversationSchema = z
  .object({
    id: objectIdSchema,
    subject: z.object({
      kind: z.enum(chatSubjectKinds),
      id: objectIdSchema,
      code: z
        .string()
        .nullable()
        .openapi({
          description: 'Order code; null for a listing chat.',
          example: 'RO-20261118-0001',
        }),
      status: z
        .string()
        .nullable()
        .openapi({ description: 'Order status; null for a listing chat.', example: 'PAID' }),
    }),
    toy: z
      .object({ id: objectIdSchema, title: z.string(), imageUrl: z.string().nullable() })
      .nullable(),
    counterpart: personSchema.nullable(),
    lastMessage: z
      .object({
        id: objectIdSchema,
        senderId: objectIdSchema,
        preview: z.string().openapi({ description: 'Masked text, at most 100 characters.' }),
        imageCount: z.number().int(),
        sentAt: isoDateTimeSchema,
      })
      .nullable(),
    unreadCount: z.number().int().openapi({ description: 'Messages to me not read yet.' }),
    readOnly: z.boolean().openapi({
      description:
        'true 7 days after the order ended (Completed, Rejected, Expired or Cancelled): ' +
        'messages can be read but not sent (CHAT_CLOSED).',
    }),
    closesAt: isoDateTimeSchema.nullable().openapi({
      description: 'When an ended order chat becomes read-only; null while the order runs.',
    }),
    createdAt: isoDateTimeSchema,
  })
  .openapi('Conversation');
export type ConversationDto = z.infer<typeof conversationSchema>;

export const chatMessageSchema = z
  .object({
    id: objectIdSchema,
    conversationId: objectIdSchema,
    senderId: objectIdSchema,
    text: z.string().openapi({ description: 'Already masked: contact details read "***".' }),
    images: z.array(
      z.object({
        url: z
          .string()
          .nullable()
          .openapi({ description: 'Signed link valid for 1 hour; null without Cloudinary.' }),
      }),
    ),
    masked: z.boolean().openapi({
      description: 'true: contact details were hidden; show MSG41 under the message (GB-11).',
    }),
    maskedKinds: z.array(z.enum(maskedContactKinds)),
    isRead: z.boolean(),
    readAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
  })
  .openapi('ChatMessage');
export type ChatMessageDto = z.infer<typeof chatMessageSchema>;

export const openConversationResultSchema = z.object({
  conversation: conversationSchema,
  created: z.boolean(),
});

export const messagesPageSchema = z
  .object({
    items: z.array(chatMessageSchema).openapi({ description: 'Oldest first within the page.' }),
    hasMore: z.boolean(),
    nextCursor: objectIdSchema
      .nullable()
      .openapi({ description: 'Pass as `before` to load older messages; null at the start.' }),
  })
  .openapi('ChatMessagesPage');
export type MessagesPageDto = z.infer<typeof messagesPageSchema>;

export const markReadResultSchema = z.object({
  updatedCount: z.number().int(),
  readAt: isoDateTimeSchema,
});

export const chatUnreadCountSchema = z.object({ count: z.number().int() });

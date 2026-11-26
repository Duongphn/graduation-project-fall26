import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../config/openapi.js';
import {
  paginatedResponseSchema,
  successResponseSchema,
} from '../validations/common.validation.js';
import {
  chatMessageSchema,
  chatUnreadCountSchema,
  conversationIdParamsSchema,
  conversationSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  markReadResultSchema,
  messagesPageSchema,
  openConversationBodySchema,
  openConversationResultSchema,
  sendMessageBodySchema,
} from '../validations/chat.validation.js';

const tags = ['Chat'];
const security = bearerAuthSecurity;

// Realtime contract (same Socket.IO connection as the notifications), repeated in the Swagger
// descriptions so the web app has one place to read it.
const socketContract =
  'Realtime: connect Socket.IO to the API origin with `auth: { token: <access JWT> }`. ' +
  'Client -> server (each with an ack callback answering `{ ok: true, data }` or ' +
  '`{ ok: false, error: { code, message } }`): `chat:join` { conversationId } (participant ' +
  'check, data = Conversation), `chat:leave` { conversationId }, `chat:send` { conversationId, ' +
  'text?, images? } (data = ChatMessage), `chat:read` { conversationId } (data = { updatedCount, ' +
  'readAt }). Server -> client: `chat:message` { conversationId, message: ChatMessage } to both ' +
  'parties, `chat:read` { conversationId, readerId, readAt } (read receipt). After a reconnect, ' +
  'reload the conversation list and the open room.';

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/conversations',
  tags,
  security,
  summary: 'Open (or create) the chat of a listing or an order (UC25)',
  description:
    "TOY: the toy must be visible (active) and not the caller's own (CHAT_WITH_SELF); one chat " +
    'per listing and interested user. RENTAL_ORDER / PURCHASE_ORDER: the caller must be the ' +
    'renter/owner or buyer/seller (403); one chat per order. 201 when created, 200 when it ' +
    'already existed.',
  request: { body: { content: jsonContent(openConversationBodySchema) } },
  responses: {
    200: {
      description: 'The existing conversation',
      content: jsonContent(successResponseSchema(openConversationResultSchema)),
    },
    201: {
      description: 'The new conversation',
      content: jsonContent(successResponseSchema(openConversationResultSchema)),
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/conversations',
  tags,
  security,
  summary: 'My conversations, most recent message first (R03 6.3.1 (1), (2))',
  description: socketContract,
  request: { query: listConversationsQuerySchema },
  responses: {
    200: {
      description: 'Paginated conversations with counterpart, last message and unread count',
      content: jsonContent(paginatedResponseSchema(conversationSchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/conversations/unread-count',
  tags,
  security,
  summary: 'Number of chat messages to me not read yet (all conversations)',
  responses: {
    200: {
      description: 'Unread message count',
      content: jsonContent(successResponseSchema(chatUnreadCountSchema)),
    },
    ...errorResponses(401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/conversations/{conversationId}',
  tags,
  security,
  summary: 'One of my conversations',
  request: { params: conversationIdParamsSchema },
  responses: {
    200: {
      description: 'The conversation',
      content: jsonContent(successResponseSchema(conversationSchema)),
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/conversations/{conversationId}/messages',
  tags,
  security,
  summary: 'Room history: the latest 50 messages, then older pages (R03 6.3.1 (5))',
  description:
    'Items are oldest first within a page. To load older messages, pass nextCursor as `before`.',
  request: { params: conversationIdParamsSchema, query: listMessagesQuerySchema },
  responses: {
    200: {
      description: 'One page of messages',
      content: jsonContent(successResponseSchema(messagesPageSchema)),
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/api/v1/conversations/{conversationId}/messages',
  tags,
  security,
  summary: 'Send a text and/or image message (same as the chat:send socket event)',
  description:
    'Text max 1000 characters; up to 5 images, each uploaded first with ' +
    'POST /uploads/signature purpose CHAT_IMAGE by the sender (CHAT_IMAGE_NOT_OWNED otherwise). ' +
    'Phone numbers, email addresses, http/https/www links and bank account numbers are replaced ' +
    'by "***" before the message is stored (GB-11, fixed patterns); `masked: true` means the ' +
    'web app shows MSG41 under the message. The message is pushed to both parties as ' +
    '`chat:message`; an offline recipient gets an in-app notification (type CHAT_MESSAGE). ' +
    'CHAT_CLOSED (409): the order ended more than 7 days ago, the chat is read-only.',
  request: {
    params: conversationIdParamsSchema,
    body: { content: jsonContent(sendMessageBodySchema) },
  },
  responses: {
    201: {
      description: 'The stored (masked) message',
      content: jsonContent(successResponseSchema(chatMessageSchema)),
    },
    ...errorResponses(400, 401, 403, 404, 409, 422),
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/v1/conversations/{conversationId}/read',
  tags,
  security,
  summary: 'Mark the messages I received in this conversation as read',
  description: 'The other party receives a `chat:read` read receipt when something changed.',
  request: { params: conversationIdParamsSchema },
  responses: {
    200: {
      description: 'How many messages were marked read',
      content: jsonContent(successResponseSchema(markReadResultSchema)),
    },
    ...errorResponses(400, 401, 403, 404),
  },
});

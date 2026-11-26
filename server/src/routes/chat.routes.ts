import { Router, type RequestHandler } from 'express';

import { createChatController } from '../controllers/chat.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { validateRequest } from '../middlewares/validate.js';
import type { ChatService } from '../services/chat.service.js';
import { emptyObjectSchema } from '../validations/common.validation.js';
import {
  conversationIdParamsSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  openConversationBodySchema,
  sendMessageBodySchema,
} from '../validations/chat.validation.js';
import './chat.openapi.js';

// Mounted at /api/v1/conversations. Chat is for signed-in Users only (R03 IV.1 Chat row);
// every route checks in the service that the caller is a participant.
export function createChatRouter(
  service: ChatService,
  guards: RequestHandler[] = [authenticate, requireActor],
): Router {
  const router = Router();
  const controller = createChatController(service);
  router.use(...guards);

  router.post(
    '/',
    validateRequest({ body: openConversationBodySchema }),
    controller.openConversation,
  );
  router.get(
    '/',
    validateRequest({ query: listConversationsQuerySchema }),
    controller.listConversations,
  );
  router.get(
    '/unread-count',
    validateRequest({ query: emptyObjectSchema }),
    controller.getUnreadCount,
  );
  router.get(
    '/:conversationId',
    validateRequest({ params: conversationIdParamsSchema }),
    controller.getConversation,
  );
  router.get(
    '/:conversationId/messages',
    validateRequest({ params: conversationIdParamsSchema, query: listMessagesQuerySchema }),
    controller.listMessages,
  );
  router.post(
    '/:conversationId/messages',
    validateRequest({ params: conversationIdParamsSchema, body: sendMessageBodySchema }),
    controller.sendMessage,
  );
  router.patch(
    '/:conversationId/read',
    validateRequest({ params: conversationIdParamsSchema }),
    controller.markRead,
  );

  return router;
}

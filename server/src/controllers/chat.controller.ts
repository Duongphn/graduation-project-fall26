import type { Request, Response } from 'express';

import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../middlewares/validate.js';
import type { ChatService } from '../services/chat.service.js';
import { getRequestUserId } from '../utils/admin-context.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import type {
  ConversationIdParams,
  ListConversationsQuery,
  ListMessagesQuery,
  OpenConversationBody,
  SendMessageBody,
} from '../validations/chat.validation.js';

// Chat with User (UC25): HTTP side. Realtime events are in sockets/chat.socket.ts.
export const createChatController = (service: ChatService) => ({
  openConversation: async (request: Request, response: Response): Promise<void> => {
    const result = await service.openConversation(
      getRequestUserId(request),
      getValidatedBody<OpenConversationBody>(request),
    );
    if (result.created) sendCreated(response, result);
    else sendSuccess(response, result);
  },

  listConversations: async (request: Request, response: Response): Promise<void> => {
    const query = getValidatedQuery<ListConversationsQuery>(response);
    const { items, totalItems } = await service.listConversations(getRequestUserId(request), query);
    sendPaginated(response, items, query, totalItems);
  },

  getUnreadCount: async (request: Request, response: Response): Promise<void> => {
    sendSuccess(response, await service.countUnread(getRequestUserId(request)));
  },

  getConversation: async (request: Request, response: Response): Promise<void> => {
    const { conversationId } = getValidatedParams<ConversationIdParams>(response);
    sendSuccess(response, await service.getConversation(getRequestUserId(request), conversationId));
  },

  listMessages: async (request: Request, response: Response): Promise<void> => {
    const { conversationId } = getValidatedParams<ConversationIdParams>(response);
    const query = getValidatedQuery<ListMessagesQuery>(response);
    sendSuccess(
      response,
      await service.listMessages(getRequestUserId(request), conversationId, query),
    );
  },

  sendMessage: async (request: Request, response: Response): Promise<void> => {
    const { conversationId } = getValidatedParams<ConversationIdParams>(response);
    sendCreated(
      response,
      await service.sendMessage(
        getRequestUserId(request),
        conversationId,
        getValidatedBody<SendMessageBody>(request),
      ),
    );
  },

  markRead: async (request: Request, response: Response): Promise<void> => {
    const { conversationId } = getValidatedParams<ConversationIdParams>(response);
    sendSuccess(response, await service.markRead(getRequestUserId(request), conversationId));
  },
});

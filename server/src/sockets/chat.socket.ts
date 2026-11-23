import type { Server, Socket } from 'socket.io';
import { ZodError, type ZodType } from 'zod';

import { chatSocketEvents, conversationRoom } from '../constants/chat.js';
import type { ChatRealtime } from '../interfaces/chat.ports.js';
import { toValidationDetails } from '../middlewares/validate.js';
import type { ChatService } from '../services/chat.service.js';
import { AppError } from '../utils/app-error.js';
import { objectIdSchema } from '../validations/common.validation.js';
import { sendMessageBodySchema } from '../validations/chat.validation.js';
import { z } from '../validations/zod.js';
import { findSocketLockError, userRoom, type SocketUser } from './socket.js';

// Chat over the shared Socket.IO connection (UC25, R04 III.1.2). sockets/socket.ts checks the
// JWT at the handshake and puts every connection in its "user:<id>" room, which the chat and the
// notifications push to; joining a conversation room is checked here (participants only).

/** Pushes to the "user:<id>" rooms of the Socket.IO server once it is attached. */
export class SocketChatRealtime implements ChatRealtime {
  private io: Server | undefined;

  public attach(io: Server): void {
    this.io = io;
  }

  public async isUserOnline(userId: string): Promise<boolean> {
    if (!this.io) return false;
    return (await this.io.in(userRoom(userId)).fetchSockets()).length > 0;
  }

  public publish(userIds: readonly string[], event: string, payload: unknown): void {
    if (!this.io || userIds.length === 0) return;
    // One emit to several rooms reaches each connection once.
    this.io.to([...new Set(userIds)].map(userRoom)).emit(event, payload);
  }
}

export type AckResult =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

const toAckError = (error: unknown): AckResult => {
  if (error instanceof AppError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
  }
  if (error instanceof ZodError) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu yêu cầu không hợp lệ.',
        details: toValidationDetails(error),
      },
    };
  }
  console.error('[chat] Socket event failed:', error);
  return { ok: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Đã có lỗi xảy ra.' } };
};

const roomPayloadSchema = z.object({ conversationId: objectIdSchema });
const sendPayloadSchema = z.object({ conversationId: objectIdSchema }).loose();

const parse = <T>(schema: ZodType<T>, payload: unknown): T => schema.parse(payload ?? {});

/**
 * The chat events of one signed-in User, without Socket.IO (tested directly). Each handler
 * answers the ack shape { ok, data } or { ok: false, error: { code, message } }.
 */
export const createChatSocketHandlers = (service: ChatService) => {
  const run = async (task: () => Promise<unknown>): Promise<AckResult> => {
    try {
      return { ok: true, data: await task() };
    } catch (error) {
      return toAckError(error);
    }
  };
  // UC29 safety net: an account locked while its connection stays open is refused like REST.
  const runAs = (userId: string, task: () => Promise<unknown>) =>
    run(async () => {
      const locked = await findSocketLockError(userId);
      if (locked) throw locked;
      return task();
    });
  return {
    join: (userId: string, payload: unknown, joinRoom: (room: string) => unknown) =>
      runAs(userId, async () => {
        const { conversationId } = parse(roomPayloadSchema, payload);
        const conversation = await service.getConversation(userId, conversationId);
        await joinRoom(conversationRoom(conversationId));
        return conversation;
      }),
    send: (userId: string, payload: unknown) =>
      runAs(userId, () => {
        const { conversationId, ...rest } = parse(sendPayloadSchema, payload);
        // Same rules as POST /conversations/:id/messages.
        return service.sendMessage(userId, conversationId, sendMessageBodySchema.parse(rest));
      }),
    read: (userId: string, payload: unknown) =>
      runAs(userId, () =>
        service.markRead(userId, parse(roomPayloadSchema, payload).conversationId),
      ),
    leave: (payload: unknown, leaveRoom: (room: string) => unknown) =>
      run(async () => {
        const { conversationId } = parse(roomPayloadSchema, payload);
        await leaveRoom(conversationRoom(conversationId));
        return null;
      }),
  };
};

const replyTo = (ack: unknown) => (result: AckResult) => {
  if (typeof ack === 'function') (ack as (result: AckResult) => void)(result);
};

const LOCKED_CODE = 'USER_INACTIVE';

/** Wires the chat events into the Socket.IO server made by createSocketServer. */
export const registerChatSocket = (
  io: Server,
  service: ChatService,
  realtime: SocketChatRealtime,
): void => {
  realtime.attach(io);
  const handlers = createChatSocketHandlers(service);

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as SocketUser | undefined;
    // Chat is for Users (R03 IV.1); an Admin connection only receives its notifications.
    if (user?.role !== 'USER') return;
    const { userId } = user;
    // A refused event of a locked account also closes the connection (notifications included).
    const answer = (ack: unknown) => (result: AckResult) => {
      replyTo(ack)(result);
      if (!result.ok && result.error.code === LOCKED_CODE) socket.disconnect(true);
    };

    socket.on(chatSocketEvents.join, (payload: unknown, ack?: unknown) => {
      void handlers.join(userId, payload, (room) => socket.join(room)).then(answer(ack));
    });
    socket.on(chatSocketEvents.leave, (payload: unknown, ack?: unknown) => {
      void handlers.leave(payload, (room) => socket.leave(room)).then(replyTo(ack));
    });
    socket.on(chatSocketEvents.send, (payload: unknown, ack?: unknown) => {
      void handlers.send(userId, payload).then(answer(ack));
    });
    socket.on(chatSocketEvents.read, (payload: unknown, ack?: unknown) => {
      void handlers.read(userId, payload).then(answer(ack));
    });
  });
};

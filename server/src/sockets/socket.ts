import type { Server as HttpServer } from 'node:http';

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Server, type Socket } from 'socket.io';

import { env } from '../config/env.js';
import type { NotificationPusher } from '../interfaces/notification.ports.js';
import { accountLockedError, findRunningLock } from '../services/account-lock.service.js';
import type { AppError } from '../utils/app-error.js';

export interface SocketUser {
  userId: string;
  role: 'USER' | 'ADMIN';
}

/** Room of one user: every open tab of that user joins it. */
export const userRoom = (userId: string): string => `user:${userId}`;

/**
 * Checks the access token sent in the handshake (`auth: { token }`), the same JWT the REST API
 * takes. R04: the JWT is checked once per connection in io.use().
 */
export const verifySocketToken = (token: unknown, secret = env.jwtAccessSecret): SocketUser => {
  if (typeof token !== 'string' || !token.trim()) throw new Error('UNAUTHORIZED');
  const payload = jwt.verify(token.trim().replace(/^Bearer\s+/i, ''), secret);
  if (typeof payload !== 'object' || payload === null) throw new Error('UNAUTHORIZED');
  const { userId, role } = payload as { userId?: unknown; role?: unknown };
  if (typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('UNAUTHORIZED');
  }
  if (role !== 'USER' && role !== 'ADMIN') throw new Error('UNAUTHORIZED');
  return { userId, role };
};

/**
 * UC29: the error of a user under a running Admin lock (MSG12 with the reason, the same rule and
 * message as `authenticate`), or null. Skipped without a database connection.
 */
export const findSocketLockError = async (userId: string): Promise<AppError | null> => {
  if (mongoose.connection.readyState !== 1) return null;
  const lock = await findRunningLock(userId);
  return lock ? accountLockedError(lock, 401) : null;
};

/** connect_error on the client: the code as the message, the REST error body as `data`. */
const toHandshakeError = ({ code, message, details }: AppError): Error =>
  Object.assign(new Error(code), { data: { code, message, details } });

const authenticateSocket = (socket: Socket, next: (error?: Error) => void) => {
  let user: SocketUser;
  try {
    user = verifySocketToken(socket.handshake.auth?.token);
  } catch {
    // The client reconnects with a fresh token after it refreshes the session.
    next(new Error('UNAUTHORIZED'));
    return;
  }
  // A locked account cannot open a connection with a token issued before the lock either.
  findSocketLockError(user.userId).then(
    (locked) => {
      if (locked) return next(toHandshakeError(locked));
      socket.data.user = user;
      next();
    },
    (error: unknown) => {
      console.error('[socket] Account check failed:', error);
      next(new Error('INTERNAL_SERVER_ERROR'));
    },
  );
};

export const createSocketServer = (server: HttpServer, corsOrigin: string): Server => {
  const io = new Server(server, {
    cors: {
      origin: corsOrigin,
    },
  });
  io.use(authenticateSocket);
  io.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;
    void socket.join(userRoom(user.userId));
  });
  return io;
};

/** Closes every open connection of one user (UC29: the lock ends the current session). */
export const disconnectUser = (io: Server, userId: string): void => {
  io.in(userRoom(userId)).disconnectSockets(true);
};

/** Notifications (and later other modules) push to a user through the user's room. */
export const createSocketPusher = (io: Server): NotificationPusher => ({
  toUser(userId, event, payload) {
    io.to(userRoom(userId)).emit(event, payload);
  },
});

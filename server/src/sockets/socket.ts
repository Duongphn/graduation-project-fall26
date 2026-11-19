import type { Server as HttpServer } from 'node:http';

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Server, type Socket } from 'socket.io';

import { env } from '../config/env.js';
import type { NotificationPusher } from '../interfaces/notification.ports.js';

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

const authenticateSocket = (socket: Socket, next: (error?: Error) => void) => {
  try {
    socket.data.user = verifySocketToken(socket.handshake.auth?.token);
    next();
  } catch {
    // The client reconnects with a fresh token after it refreshes the session.
    next(new Error('UNAUTHORIZED'));
  }
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

/** Notifications (and later other modules) push to a user through the user's room. */
export const createSocketPusher = (io: Server): NotificationPusher => ({
  toUser(userId, event, payload) {
    io.to(userRoom(userId)).emit(event, payload);
  },
});

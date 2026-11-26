import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { Server } from 'socket.io';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../../src/config/env.js';
import { systemClock } from '../../src/interfaces/rental-order.ports.js';
import { Conversation } from '../../src/models/conversation.model.js';
import { User } from '../../src/models/user.model.js';
import { ChatService } from '../../src/services/chat.service.js';
import { registerChatSocket, SocketChatRealtime } from '../../src/sockets/chat.socket.js';
import { createSocketServer } from '../../src/sockets/socket.js';
import { domainEvents, type NotifyEvent } from '../../src/utils/domain-events.js';
import { useTestDatabase } from '../support/test-database.js';

useTestDatabase();

// End to end over the shared Socket.IO server (sockets/socket.ts checks the token and joins the
// user rooms; the chat only adds its events).

const notices: NotifyEvent[] = [];
const clients: ClientSocket[] = [];
let offNotify: () => void;
let httpServer: HttpServer;
let io: Server;
let url: string;
let renter: string;
let owner: string;
let conversationId: string;

const tokenFor = (userId: string, role = 'USER') =>
  jwt.sign({ userId, role }, env.jwtAccessSecret, { expiresIn: '5m' });

const connect = async (userId: string, role = 'USER'): Promise<ClientSocket> => {
  const client = connectClient(url, {
    auth: { token: tokenFor(userId, role) },
    transports: ['websocket'],
    reconnection: false,
  });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', () => resolve());
    client.once('connect_error', reject);
  });
  return client;
};

const nextEvent = (client: ClientSocket, event: string) =>
  new Promise<any>((resolve) => client.once(event, resolve));

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 50 && !check(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

beforeAll(async () => {
  offNotify = domainEvents.subscribe('NOTIFY', (event) => {
    if (event.notificationType === 'CHAT_MESSAGE') notices.push(event);
  });
  const realtime = new SocketChatRealtime();
  const service = new ChatService({ realtime, clock: systemClock });
  httpServer = createServer();
  io = createSocketServer(httpServer, '*');
  registerChatSocket(io, service, realtime);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  const [a, b] = await User.create([
    { phone: '+84950000001', email: 'ws1@example.com', passwordHash: 'x', fullName: 'Lan' },
    { phone: '+84950000002', email: 'ws2@example.com', passwordHash: 'x', fullName: 'Minh' },
  ]);
  renter = String(a?._id);
  owner = String(b?._id);
  const conversation = await Conversation.create({
    participants: [{ userId: a?._id }, { userId: b?._id }],
    context: { kind: 'RENTAL_ORDER', id: new Types.ObjectId() },
  });
  conversationId = String(conversation._id);
});

afterAll(async () => {
  offNotify();
  clients.forEach((client) => client.disconnect());
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

describe('chat over Socket.IO', () => {
  it('pushes a sent message to the online recipient and acks the sender', async () => {
    const lan = await connect(renter);
    const minh = await connect(owner);

    const joined = await minh.emitWithAck('chat:join', { conversationId });
    expect(joined).toMatchObject({ ok: true, data: { id: conversationId, readOnly: false } });

    const incoming = nextEvent(minh, 'chat:message');
    const echo = nextEvent(lan, 'chat:message');
    const ack = await lan.emitWithAck('chat:send', {
      conversationId,
      text: 'SĐT mình 0912 345 678',
    });
    expect(ack).toMatchObject({ ok: true, data: { text: 'SĐT mình ***', masked: true } });
    expect(await incoming).toEqual({ conversationId, message: ack.data });
    // The sender's other tabs get it too.
    expect(await echo).toEqual({ conversationId, message: ack.data });

    const receipt = nextEvent(lan, 'chat:read');
    const read = await minh.emitWithAck('chat:read', { conversationId });
    expect(read).toMatchObject({ ok: true, data: { updatedCount: 1 } });
    expect(await receipt).toMatchObject({ conversationId, readerId: owner });
    expect(notices).toHaveLength(0);

    // Offline recipient: nothing to push to, a CHAT_MESSAGE notification instead.
    minh.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const offline = await lan.emitWithAck('chat:send', { conversationId, text: 'Bạn ơi?' });
    expect(offline.ok).toBe(true);
    await waitFor(() => notices.length > 0);
    expect(notices).toMatchObject([
      { to: owner, link: `/chat/${conversationId}`, email: false, actorId: renter },
    ]);
  });

  it('refuses a non-participant and ignores chat events from an Admin', async () => {
    const stranger = await connect(new Types.ObjectId().toHexString());
    const refused = await stranger.emitWithAck('chat:send', { conversationId, text: 'Hi' });
    expect(refused).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    const invalid = await stranger.emitWithAck('chat:join', { conversationId: 'x' });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });

    const admin = await connect(new Types.ObjectId().toHexString(), 'ADMIN');
    await expect(
      admin.timeout(300).emitWithAck('chat:send', { conversationId, text: 'Hi' }),
    ).rejects.toThrow();
  });
});

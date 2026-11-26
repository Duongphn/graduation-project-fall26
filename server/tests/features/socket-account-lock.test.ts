import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { Server } from 'socket.io';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { env } from '../../src/config/env.js';
import { systemClock } from '../../src/interfaces/rental-order.ports.js';
import { authenticate } from '../../src/middlewares/authenticate.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { Conversation } from '../../src/models/conversation.model.js';
import { Message } from '../../src/models/message.model.js';
import { User } from '../../src/models/user.model.js';
import { adminAccountsRouter } from '../../src/routes/account-admin.routes.js';
import {
  adminViolationReportsRouter,
  violationReportsRouter,
} from '../../src/routes/violation-report.routes.js';
import { setOpenConnectionCloser } from '../../src/services/account-lock.service.js';
import { ChatService } from '../../src/services/chat.service.js';
import { setNotificationPusher } from '../../src/services/notification.service.js';
import { subscribeNotifications } from '../../src/services/notification.subscriptions.js';
import { registerChatSocket, SocketChatRealtime } from '../../src/sockets/chat.socket.js';
import {
  createSocketPusher,
  createSocketServer,
  disconnectUser,
} from '../../src/sockets/socket.js';
import { notify } from '../../src/utils/notify.js';
import { testAuth } from '../support/test-auth.js';
import { useTestDatabase } from '../support/test-database.js';

useTestDatabase();

// DEF-IT-45 (ITC_SEC_25): an account locked by an Admin (UC29) loses its Socket.IO connections
// too: the open ones are closed, a new one with a token issued before the lock is refused (MSG12),
// and chat events of a connection still open under a lock are refused.

const LOCK_REASON = 'Nhận cọc riêng qua chuyển khoản rồi không giao đồ, có nhiều báo cáo.';
const UNLOCK_REASON = 'Người dùng đã hoàn tiền cọc và cam kết tuân thủ quy định.';

const app = express();
app.use(express.json());
app.use(testAuth);
app.use('/api/v1/admin/users', adminAccountsRouter);
app.use('/api/v1/violation-reports', violationReportsRouter);
app.use('/api/v1/admin/violation-reports', adminViolationReportsRouter);
app.use(errorHandler);

// develop's real `authenticate`, to compare the socket refusal with the REST one.
const restApp = express();
restApp.get('/probe', authenticate, (_request, response) => {
  response.json({ ok: true });
});
restApp.use(errorHandler);

const ADMIN_ID = new Types.ObjectId();
const asAdmin = (test: request.Test) =>
  test.set('x-test-user', String(ADMIN_ID)).set('x-test-role', 'ADMIN');
const lock = (userId: string, duration = '7d') =>
  asAdmin(request(app).post(`/api/v1/admin/users/${userId}/lock`)).send({
    duration,
    reason: LOCK_REASON,
  });
const unlock = (userId: string) =>
  asAdmin(request(app).post(`/api/v1/admin/users/${userId}/unlock`)).send({
    reason: UNLOCK_REASON,
  });

const clients: ClientSocket[] = [];
let httpServer: HttpServer;
let io: Server;
let url: string;
let offNotifications: () => void;

const tokenFor = (userId: string, role = 'USER') =>
  jwt.sign({ userId, role }, env.jwtAccessSecret, { expiresIn: '5m' });

const open = (token: string) => {
  const client = connectClient(url, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
  clients.push(client);
  return client;
};

const connect = async (token: string): Promise<ClientSocket> => {
  const client = open(token);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', () => resolve());
    client.once('connect_error', reject);
  });
  return client;
};

const refusal = (token: string) =>
  new Promise<Error & { data?: any }>((resolve, reject) => {
    const client = open(token);
    client.once('connect', () => reject(new Error('connected')));
    client.once('connect_error', resolve);
  });

const disconnected = (client: ClientSocket) =>
  new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve('still connected'), 3000);
    client.once('disconnect', (reason) => {
      clearTimeout(timer);
      resolve(reason);
    });
  });

const collect = (client: ClientSocket, event: string) => {
  const received: any[] = [];
  client.on(event, (payload) => received.push(payload));
  return received;
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let seq = 0;
const createUser = async (fullName: string) => {
  seq += 1;
  const user = await User.create({
    phone: `+8496${String(seq).padStart(7, '0')}`,
    email: `socketlock${seq}@toyflow.test`,
    passwordHash: 'x',
    fullName,
  });
  return String(user._id);
};

let lan: string;
let minh: string;
let conversationId: string;

beforeAll(async () => {
  offNotifications = subscribeNotifications({
    mailer: { send: () => Promise.resolve({ delivered: false }) },
  });
  const realtime = new SocketChatRealtime();
  httpServer = createServer();
  io = createSocketServer(httpServer, '*');
  setNotificationPusher(createSocketPusher(io));
  // As server.ts does: the lock closes the user's open connections.
  setOpenConnectionCloser((userId) => disconnectUser(io, userId));
  registerChatSocket(io, new ChatService({ realtime, clock: systemClock }), realtime);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  offNotifications();
  setOpenConnectionCloser(undefined);
  setNotificationPusher(undefined);
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

beforeEach(async () => {
  await User.create({
    _id: ADMIN_ID,
    phone: '+84960000000',
    email: 'admin.socket@toyflow.test',
    passwordHash: 'x',
    fullName: 'Quản trị viên',
    role: 'ADMIN',
  }).catch(() => undefined);
  lan = await createUser('Người Bị Khóa');
  minh = await createUser('Người Nhận');
  const conversation = await Conversation.create({
    participants: [{ userId: new Types.ObjectId(lan) }, { userId: new Types.ObjectId(minh) }],
    context: { kind: 'RENTAL_ORDER', id: new Types.ObjectId() },
  });
  conversationId = String(conversation._id);
});

afterEach(() => {
  clients.splice(0).forEach((client) => client.disconnect());
});

const messagesFrom = (userId: string) =>
  Message.countDocuments({ conversationId, senderId: new Types.ObjectId(userId) });

describe('Socket.IO and the Admin account lock (DEF-IT-45)', () => {
  it('closes every open connection of the locked user: no chat, no notifications; the other party sees nothing new', async () => {
    const token = tokenFor(lan);
    const tab1 = await connect(token);
    const tab2 = await connect(token);
    const other = await connect(tokenFor(minh));
    const admin = await connect(tokenFor(String(ADMIN_ID), 'ADMIN'));
    expect(await tab1.emitWithAck('chat:join', { conversationId })).toMatchObject({ ok: true });
    expect(await other.emitWithAck('chat:join', { conversationId })).toMatchObject({ ok: true });
    const otherGot = collect(other, 'chat:message');
    const lanNotices = collect(tab2, 'notification:new');
    const adminNotices = collect(admin, 'notification:new');

    // Before the lock: chat and notifications reach both sides.
    expect(await tab1.emitWithAck('chat:send', { conversationId, text: 'Chào bạn' })).toMatchObject(
      { ok: true },
    );
    notify({ type: 'SYSTEM', to: lan, title: 'Trước khi khóa', body: 'x', email: false });
    for (let i = 0; i < 50 && (otherGot.length < 1 || lanNotices.length < 1); i += 1)
      await pause(20);
    expect(otherGot).toHaveLength(1);
    expect(lanNotices).toHaveLength(1);

    const closed = [disconnected(tab1), disconnected(tab2)];
    const response = await lock(lan);
    expect(response.status).toBe(200);
    expect(await Promise.all(closed)).toEqual(['io server disconnect', 'io server disconnect']);
    expect(tab1.connected || tab2.connected).toBe(false);
    // The other party and the Admin keep their connections.
    expect(other.connected && admin.connected).toBe(true);

    // Nothing more reaches the locked user's tabs, and nothing from it reaches the other party.
    notify({ type: 'SYSTEM', to: lan, title: 'Sau khi khóa', body: 'x', email: false });
    notify({ type: 'SYSTEM', to: String(ADMIN_ID), title: 'Cho Admin', body: 'x', email: false });
    for (let i = 0; i < 50 && adminNotices.length < 1; i += 1) await pause(20);
    await pause(150);
    expect(adminNotices).toHaveLength(1);
    expect(lanNotices).toHaveLength(1);
    expect(otherGot).toHaveLength(1);
    expect(await messagesFrom(lan)).toBe(1);
  });

  it('refuses a new connection with a token issued before the lock, with MSG12 as REST does', async () => {
    const token = tokenFor(lan);
    expect((await connect(token)).connected).toBe(true);
    await lock(lan, '30d');

    const error = await refusal(token);
    const rest = await request(restApp).get('/probe').set('Authorization', `Bearer ${token}`);
    expect(rest.status).toBe(401);
    expect(error.message).toBe('USER_INACTIVE');
    expect(error.data).toEqual(rest.body.error);
    expect(error.data.message).toMatch(
      /^Tài khoản của bạn đã bị khóa đến \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\. Lý do: /,
    );
    expect(error.data.message).toContain(LOCK_REASON);
    // Typed forms of the token the client may send are refused the same way.
    expect((await refusal(`Bearer ${token}`)).message).toBe('USER_INACTIVE');
    expect((await refusal(`  ${token}  `)).message).toBe('USER_INACTIVE');
    // A bad token stays UNAUTHORIZED; other accounts still connect.
    expect((await refusal('not-a-jwt')).message).toBe('UNAUTHORIZED');
    expect((await connect(tokenFor(minh))).connected).toBe(true);
  });

  it('closes the connections when the lock comes through a violation report', async () => {
    const reporter = await createUser('Người Báo Cáo');
    const tab = await connect(tokenFor(lan));
    const created = await request(app)
      .post('/api/v1/violation-reports')
      .set('x-test-user', reporter)
      .send({
        targetKind: 'user',
        targetId: lan,
        reason: 'scam',
        description: 'Nhận cọc rồi không giao đồ chơi.',
      });
    expect(created.status).toBe(201);

    const closed = disconnected(tab);
    const resolved = await asAdmin(
      request(app).post(`/api/v1/admin/violation-reports/${created.body.data.id}/resolve`),
    ).send({ action: 'lock', lockDuration: 'permanent', note: LOCK_REASON });
    expect(resolved.status).toBe(200);
    expect(await closed).toBe('io server disconnect');
    const error = await refusal(tokenFor(lan));
    expect(error.data).toMatchObject({
      code: 'USER_INACTIVE',
      message: `Tài khoản của bạn đã bị khóa. Lý do: ${LOCK_REASON}`,
      details: { lockedUntil: null },
    });
  });

  it('refuses the chat events of a connection still open under a lock and closes it', async () => {
    const tab = await connect(tokenFor(lan));
    const tab2 = await connect(tokenFor(lan));
    const other = await connect(tokenFor(minh));
    await other.emitWithAck('chat:join', { conversationId });
    const otherGot = collect(other, 'chat:message');
    // A lock this server did not make (another instance, or the database): nothing closed it.
    await User.updateOne(
      { _id: lan },
      { $set: { status: 'LOCKED', lock: { reason: LOCK_REASON } } },
    );

    const closed = disconnected(tab);
    const sent = await tab.emitWithAck('chat:send', {
      conversationId,
      text: 'Gửi sau khi bị khóa',
    });
    expect(sent).toEqual({
      ok: false,
      error: {
        code: 'USER_INACTIVE',
        message: `Tài khoản của bạn đã bị khóa. Lý do: ${LOCK_REASON}`,
        details: { lockedUntil: null },
      },
    });
    expect(await closed).toBe('io server disconnect');
    expect(await tab2.emitWithAck('chat:join', { conversationId })).toMatchObject({
      ok: false,
      error: { code: 'USER_INACTIVE' },
    });
    await pause(150);
    expect(otherGot).toHaveLength(0);
    expect(await messagesFrom(lan)).toBe(0);
  });

  it('lets the account connect and chat again once unlocked or once a timed lock has run out', async () => {
    const token = tokenFor(lan);
    await lock(lan);
    expect((await refusal(token)).message).toBe('USER_INACTIVE');

    expect((await unlock(lan)).status).toBe(200);
    const tab = await connect(token);
    const other = await connect(tokenFor(minh));
    await other.emitWithAck('chat:join', { conversationId });
    const incoming = new Promise((resolve) => other.once('chat:message', resolve));
    expect(await tab.emitWithAck('chat:join', { conversationId })).toMatchObject({ ok: true });
    expect(
      await tab.emitWithAck('chat:send', { conversationId, text: 'Mình quay lại rồi' }),
    ).toMatchObject({
      ok: true,
      data: { text: 'Mình quay lại rồi' },
    });
    expect(await incoming).toMatchObject({
      conversationId,
      message: { text: 'Mình quay lại rồi' },
    });

    // A timed lock whose end has passed (before the unlock job runs) no longer blocks.
    await lock(lan);
    await User.updateOne({ _id: lan }, { $set: { 'lock.until': new Date(Date.now() - 1000) } });
    expect((await connect(token)).connected).toBe(true);
  });
});

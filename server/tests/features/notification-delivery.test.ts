import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import jwt from 'jsonwebtoken';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../../src/config/env.js';
import type { MailMessage, NotificationPusher } from '../../src/interfaces/notification.ports.js';
import { IdentityReviewNotifications } from '../../src/integrations/events/identity-review-notifications.js';
import { RentalOrderNotifications } from '../../src/integrations/events/rental-order-notifications.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { Notification } from '../../src/models/notification.model.js';
import { NotificationPreference } from '../../src/models/notification-preference.model.js';
import { User } from '../../src/models/user.model.js';
import { notificationsRouter } from '../../src/routes/notification.routes.js';
import { setNotificationPusher } from '../../src/services/notification.service.js';
import { subscribeNotifications } from '../../src/services/notification.subscriptions.js';
import { createSocketPusher, createSocketServer } from '../../src/sockets/socket.js';
import { domainEvents, type DomainEvent } from '../../src/utils/domain-events.js';
import { notify } from '../../src/utils/notify.js';
import { testAuth } from '../support/test-auth.js';
import { newId, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const app = express();
app.use(express.json());
app.use(testAuth);
app.use('/api/v1/notifications', notificationsRouter);
app.use(errorHandler);

let seq = 0;
const createUser = (overrides: Record<string, unknown> = {}) => {
  seq += 1;
  return User.create({
    phone: `+8493${String(seq).padStart(7, '0')}`,
    email: `delivery${seq}@example.com`,
    passwordHash: 'x',
    fullName: 'Nguyen Van B',
    ...overrides,
  });
};

const waitFor = async (check: () => Promise<boolean> | boolean) => {
  for (let i = 0; i < 100; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out');
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

interface Pushed {
  userId: string;
  event: string;
  payload: unknown;
}

let sent: MailMessage[];
let pushed: Pushed[];
let off: () => void;
const pusher: NotificationPusher = {
  toUser: (userId, event, payload) => pushed.push({ userId, event, payload }),
};

beforeEach(async () => {
  await Promise.all([
    Notification.deleteMany({}),
    NotificationPreference.deleteMany({}),
    User.deleteMany({}),
  ]);
  sent = [];
  pushed = [];
  const mailer = {
    send: (message: MailMessage) => {
      sent.push(message);
      return Promise.resolve({ delivered: true });
    },
  };
  off = subscribeNotifications({ mailer, pusher, appPublicUrl: 'https://toyflow.test' });
  setNotificationPusher(pusher);
});

afterEach(() => {
  off();
  setNotificationPusher(undefined);
});

describe('notify(): the shared emit function', () => {
  it('saves the notification with its link, pushes it with the unread count, no email for orders', async () => {
    const owner = await createUser();
    notify({
      type: 'RENTAL_ORDER',
      to: String(owner._id),
      title: 'Yêu cầu thuê mới',
      body: 'Bạn nhận được yêu cầu thuê mới.',
      link: '/rentals/requests/abc',
    });
    await waitFor(async () => (await Notification.countDocuments()) === 1);
    const saved = await Notification.findOne().lean();
    expect(saved).toMatchObject({
      type: 'RENTAL_ORDER',
      link: '/rentals/requests/abc',
      isRead: false,
    });
    await waitFor(() => pushed.length === 1);
    expect(pushed[0]).toMatchObject({
      userId: String(owner._id),
      event: 'notification:new',
      payload: {
        unreadCount: 1,
        notification: { type: 'RENTAL_ORDER', link: '/rentals/requests/abc', isRead: false },
      },
    });
    await settle();
    expect(sent).toHaveLength(0);
  });

  it('emails a copy of an important event (dispute ruling)', async () => {
    const renter = await createUser();
    notify({
      type: 'DISPUTE',
      to: [String(renter._id)],
      title: 'Khiếu nại đã được giải quyết',
      body: 'Admin đã ra quyết định cho đơn RO-1.',
    });
    await waitFor(() => sent.length === 1);
    expect(sent[0]).toMatchObject({
      to: renter.email,
      subject: '[ToyFlow] Khiếu nại đã được giải quyết',
    });
  });

  it("sends 'ADMINS' to every active Admin and never to the actor", async () => {
    const [adminA, adminB] = await Promise.all([
      createUser({ role: 'ADMIN' }),
      createUser({ role: 'ADMIN' }),
    ]);
    await createUser({ role: 'ADMIN', status: 'LOCKED' });
    await createUser();
    notify({
      type: 'DISPUTE',
      to: 'ADMINS',
      title: 'Khiếu nại mới',
      body: 'Đơn RO-2 có khiếu nại.',
      actorId: String(adminA._id),
      email: false,
    });
    await waitFor(async () => (await Notification.countDocuments()) === 1);
    await settle();
    const saved = await Notification.find().lean();
    expect(saved.map((n) => String(n.userId))).toEqual([String(adminB._id)]);
    expect(sent).toHaveLength(0);
  });

  it('drops a link that is not an app path', async () => {
    const user = await createUser();
    notify({
      type: 'SYSTEM',
      to: String(user._id),
      title: 'T',
      body: 'B',
      link: 'https://evil.test',
    });
    await waitFor(async () => (await Notification.countDocuments()) === 1);
    expect((await Notification.findOne().lean())?.link).toBeUndefined();
  });
});

describe('muting by type', () => {
  it('skips a type the user turned off, keeps the important ones', async () => {
    const user = await createUser();
    const userId = String(user._id);
    await request(app)
      .put('/api/v1/notifications/preferences')
      .set('x-test-user', userId)
      .send({ mutedTypes: ['CHAT_MESSAGE'] })
      .expect(200);

    notify({ type: 'CHAT_MESSAGE', to: userId, title: 'Tin nhắn mới', body: 'Xin chào' });
    notify({ type: 'RENTAL_ORDER', to: userId, title: 'Đơn thuê', body: 'Đã duyệt' });
    await waitFor(async () => (await Notification.countDocuments()) === 1);
    await settle();
    const saved = await Notification.find().lean();
    expect(saved.map((n) => n.type)).toEqual(['RENTAL_ORDER']);
  });

  it('lists every type with canMute, and refuses to turn off an important type', async () => {
    const userId = String(newId());
    const initial = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('x-test-user', userId)
      .expect(200);
    const types = initial.body.data.types as Array<{
      type: string;
      canMute: boolean;
      muted: boolean;
    }>;
    expect(types.find((t) => t.type === 'DISPUTE')).toMatchObject({ canMute: false, muted: false });
    expect(types.find((t) => t.type === 'VOUCHER')).toMatchObject({ canMute: true, muted: false });

    const refused = await request(app)
      .put('/api/v1/notifications/preferences')
      .set('x-test-user', userId)
      .send({ mutedTypes: ['VOUCHER', 'WALLET'] })
      .expect(400);
    expect(refused.body.error).toMatchObject({ code: 'NOTIFICATION_TYPE_NOT_MUTABLE' });

    await request(app)
      .put('/api/v1/notifications/preferences')
      .set('x-test-user', userId)
      .send({ mutedTypes: ['FOO'] })
      .expect(400);

    const saved = await request(app)
      .put('/api/v1/notifications/preferences')
      .set('x-test-user', userId)
      .send({ mutedTypes: ['VOUCHER', 'VOUCHER', 'REMINDER'] })
      .expect(200);
    const muted = (saved.body.data.types as Array<{ type: string; muted: boolean }>)
      .filter((t) => t.muted)
      .map((t) => t.type);
    expect(muted).toEqual(['VOUCHER', 'REMINDER']);
  });

  it('lets an Admin read and save preferences too', async () => {
    await request(app)
      .get('/api/v1/notifications/preferences')
      .set('x-test-user', String(newId()))
      .set('x-test-role', 'ADMIN')
      .expect(200);
    await request(app).get('/api/v1/notifications/preferences').expect(401);
  });
});

describe('feed', () => {
  it('returns the link and maps a legacy type, and pushes the unread count after reads', async () => {
    const userId = String(newId());
    const legacy = await Notification.create({
      userId,
      type: 'IDENTITY_VERIFICATION',
      title: 'Hồ sơ xác thực',
      body: 'Đã duyệt',
    });
    await Notification.create({
      userId,
      type: 'RENTAL_ORDER',
      title: 'T',
      body: 'B',
      link: '/rentals/mine/1',
    });
    const list = await request(app)
      .get('/api/v1/notifications')
      .set('x-test-user', userId)
      .expect(200);
    const byTitle = Object.fromEntries(
      (list.body.data as Array<{ title: string; type: string; link: string | null }>).map((n) => [
        n.title,
        n,
      ]),
    );
    expect(byTitle['Hồ sơ xác thực']).toMatchObject({ type: 'IDENTITY_REVIEWED', link: null });
    expect(byTitle.T).toMatchObject({ type: 'RENTAL_ORDER', link: '/rentals/mine/1' });

    await request(app)
      .patch(`/api/v1/notifications/${String(legacy._id)}/read`)
      .set('x-test-user', userId)
      .expect(200);
    expect(pushed.at(-1)).toEqual({
      userId,
      event: 'notification:unread-count',
      payload: { count: 1 },
    });
    await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('x-test-user', userId)
      .expect(200);
    expect(pushed.at(-1)).toEqual({
      userId,
      event: 'notification:unread-count',
      payload: { count: 0 },
    });
  });

  it('pages through the feed', async () => {
    const userId = String(newId());
    await Notification.insertMany(
      Array.from({ length: 12 }, (_, i) => ({ userId, type: 'SYSTEM', title: `N${i}`, body: 'B' })),
    );
    const page2 = await request(app)
      .get('/api/v1/notifications?page=2&limit=10')
      .set('x-test-user', userId)
      .expect(200);
    expect(page2.body.data).toHaveLength(2);
    expect(page2.body.pagination).toMatchObject({ page: 2, totalItems: 12, totalPages: 2 });
  });
});

describe('module adapters', () => {
  const capture = () => {
    const events: DomainEvent[] = [];
    const offs = [
      domainEvents.subscribe('NOTIFY', (event) => {
        events.push(event);
      }),
      domainEvents.subscribe('IDENTITY_REVIEWED', (event) => {
        events.push(event);
      }),
    ];
    return { events, stop: () => offs.forEach((stop) => stop()) };
  };

  it('sends rental notifications through notify() with the page of each side', async () => {
    const { events, stop } = capture();
    const notifier = new RentalOrderNotifications();
    await notifier.notify({ userId: 'u1', title: 'A', body: 'B', orderId: 'o1', party: 'owner' });
    await notifier.notify({ userId: 'u2', title: 'A', body: 'B', orderId: 'o1', party: 'renter' });
    await notifier.notify({ userId: 'u3', title: 'A', body: 'B' });
    await waitFor(() => events.length === 3);
    stop();
    expect(events).toEqual([
      expect.objectContaining({
        notificationType: 'RENTAL_ORDER',
        to: 'u1',
        link: '/rentals/requests/o1',
      }),
      expect.objectContaining({ to: 'u2', link: '/rentals/mine/o1' }),
      expect.not.objectContaining({ link: expect.anything() }),
    ]);
  });

  it('turns an identity decision into one IDENTITY_REVIEWED event', async () => {
    const { events, stop } = capture();
    const adapter = new IdentityReviewNotifications();
    await adapter.publishStatusChanged('u1', 'rejected', 'Ảnh mờ');
    await adapter.publishStatusChanged('u1', 'pending');
    await waitFor(() => events.length === 1);
    await settle();
    stop();
    expect(events).toEqual([
      { type: 'IDENTITY_REVIEWED', userId: 'u1', decision: 'rejected', reason: 'Ảnh mờ' },
    ]);
  });
});

describe('Socket.IO', () => {
  let httpServer: HttpServer;
  let url: string;
  let socketServer: ReturnType<typeof createSocketServer>;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = createServer();
    socketServer = createSocketServer(httpServer, '*');
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    clients.forEach((client) => client.close());
    await socketServer.close();
  });

  const connect = (token?: string) => {
    const client = connectClient(url, {
      transports: ['websocket'],
      reconnection: false,
      ...(token ? { auth: { token } } : {}),
    });
    clients.push(client);
    return client;
  };
  const tokenFor = (userId: string, role = 'USER') =>
    jwt.sign({ userId, role }, env.jwtAccessSecret, { expiresIn: '5m' });

  it('refuses a connection without a valid access token', async () => {
    for (const token of [
      undefined,
      'not-a-jwt',
      jwt.sign({ userId: 'x', role: 'USER' }, env.jwtAccessSecret),
    ]) {
      const client = connect(token);
      const error = await new Promise<Error>((resolve) => client.once('connect_error', resolve));
      expect(error.message).toBe('UNAUTHORIZED');
    }
  });

  it("pushes a new notification only to the recipient's tabs", async () => {
    const user = await createUser({ role: 'ADMIN' });
    const userId = String(user._id);
    const mine = connect(tokenFor(userId, 'ADMIN'));
    const other = connect(tokenFor(String(newId())));
    await Promise.all(
      [mine, other].map(
        (client) => new Promise((resolve) => client.once('connect', () => resolve(null))),
      ),
    );
    const received: unknown[] = [];
    const leaked = vi.fn();
    mine.on('notification:new', (payload) => received.push(payload));
    other.on('notification:new', leaked);

    setNotificationPusher(createSocketPusher(socketServer));
    off();
    off = subscribeNotifications({ mailer: { send: () => Promise.resolve({ delivered: false }) } });
    notify({
      type: 'DISPUTE',
      to: 'ADMINS',
      title: 'Khiếu nại mới',
      body: 'Đơn RO-3',
      email: false,
    });

    await waitFor(() => received.length === 1);
    expect(received[0]).toMatchObject({ unreadCount: 1, notification: { title: 'Khiếu nại mới' } });
    await settle();
    expect(leaked).not.toHaveBeenCalled();
  });
});

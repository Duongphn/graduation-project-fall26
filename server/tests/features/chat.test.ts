import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ChatRealtime } from '../../src/interfaces/chat.ports.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { requireActor } from '../../src/middlewares/require-actor.js';
import { AuditLog } from '../../src/models/audit-log.model.js';
import { Conversation } from '../../src/models/conversation.model.js';
import { Message } from '../../src/models/message.model.js';
import { Notification } from '../../src/models/notification.model.js';
import { PurchaseOrder } from '../../src/models/purchase-order.model.js';
import { RentalOrder } from '../../src/models/rental-order.model.js';
import { Toy } from '../../src/models/toy.model.js';
import { User } from '../../src/models/user.model.js';
import { createChatRouter } from '../../src/routes/chat.routes.js';
import { renderChatMessage } from '../../src/services/chat.notifications.js';
import { ChatService } from '../../src/services/chat.service.js';
import { createChatSocketHandlers } from '../../src/sockets/chat.socket.js';
import { subscribeNotifications } from '../../src/services/notification.subscriptions.js';
import { domainEvents, type NotifyEvent } from '../../src/utils/domain-events.js';
import { testAuth } from '../support/test-auth.js';
import { newId, useTestDatabase } from '../support/test-database.js';

useTestDatabase();

const DAY = 24 * 60 * 60 * 1000;

// ---- test doubles ----------------------------------------------------------------------------

class FakeRealtime implements ChatRealtime {
  public online = new Set<string>();
  public events: Array<{ userIds: string[]; event: string; payload: any }> = [];
  public isUserOnline(userId: string) {
    return Promise.resolve(this.online.has(userId));
  }
  public publish(userIds: readonly string[], event: string, payload: unknown) {
    this.events.push({ userIds: [...userIds], event, payload });
  }
}

// Every notification the chat emits through notify(), plus the real notification handlers.
const notices: NotifyEvent[] = [];
const offs: Array<() => void> = [];
beforeAll(() => {
  offs.push(subscribeNotifications({ appPublicUrl: 'https://toyflow.test' }));
  offs.push(
    domainEvents.subscribe('NOTIFY', (event) => {
      if (event.notificationType === 'CHAT_MESSAGE') notices.push(event);
    }),
  );
});
afterAll(() => offs.forEach((off) => off()));

const waitFor = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 50; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out');
};

let now = new Date('2026-11-18T03:00:00.000Z');
const realtime = new FakeRealtime();
const service = new ChatService({ realtime, clock: { now: () => now } });

const app = express();
app.use(express.json());
app.use('/api/v1/conversations', createChatRouter(service, [testAuth, requireActor]));
app.use(errorHandler);

// ---- fixtures --------------------------------------------------------------------------------

let seq = 0;
const createUser = async (fullName = `Người dùng ${seq + 1}`) => {
  seq += 1;
  const user = await User.create({
    phone: `+8493${String(seq).padStart(7, '0')}`,
    email: `chat${seq}@example.com`,
    passwordHash: 'x',
    fullName,
  });
  return String(user._id);
};

const createToy = async (ownerId: string, status = 'active') => {
  const toy = await Toy.create({
    ownerId,
    categoryId: newId(),
    title: 'Bộ Lego Classic',
    description: 'Bộ Lego còn đủ mảnh, hộp đẹp, bé nhà mình ít chơi.',
    condition: 'like_new',
    listingType: 'rent',
    priceOrRate: 20000,
    status,
    ageRange: { minAge: 3, maxAge: 8 },
    images: [{ url: 'https://res.cloudinary.com/x/toy.jpg', publicId: 'toyflow/toys/a' }],
  });
  return String(toy._id);
};

// Orders are inserted raw: only the fields the chat reads, and updatedAt is set by the test.
const createRental = async (
  renterId: string,
  ownerId: string,
  status = 'PAID',
  updatedAt = now,
  code = `RO-${++seq}`,
) => {
  const _id = new Types.ObjectId();
  await RentalOrder.collection.insertOne({
    _id,
    code,
    renterId: new Types.ObjectId(renterId),
    ownerId: new Types.ObjectId(ownerId),
    toyId: newId(),
    status,
    createdAt: updatedAt,
    updatedAt,
  });
  return String(_id);
};

const createPurchase = async (buyerId: string, sellerId: string, status = 'pending') => {
  const _id = new Types.ObjectId();
  await PurchaseOrder.collection.insertOne({
    _id,
    code: `PO-${++seq}`,
    buyerId: new Types.ObjectId(buyerId),
    sellerId: new Types.ObjectId(sellerId),
    toyId: newId(),
    status,
    createdAt: now,
    updatedAt: now,
  });
  return String(_id);
};

const as = (userId: string) => ({ 'x-test-user': userId });

const open = (userId: string, kind: string, id: string) =>
  request(app).post('/api/v1/conversations').set(as(userId)).send({ kind, id });

const send = (userId: string, conversationId: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/conversations/${conversationId}/messages`).set(as(userId)).send(body);

/** A renter, an owner and their PAID rental chat. */
const rentalChat = async () => {
  const renter = await createUser('Trần Thị Lan');
  const owner = await createUser('Phạm Văn Minh');
  const orderId = await createRental(renter, owner);
  const res = await open(renter, 'RENTAL_ORDER', orderId);
  return { renter, owner, orderId, conversationId: res.body.data.conversation.id as string };
};

beforeEach(() => {
  now = new Date('2026-11-18T03:00:00.000Z');
  realtime.online.clear();
  realtime.events = [];
  notices.length = 0;
});

// ---- open ------------------------------------------------------------------------------------

describe('POST /conversations (open or create)', () => {
  it('opens one chat per visible listing and interested user', async () => {
    const owner = await createUser();
    const renter = await createUser();
    const other = await createUser();
    const toyId = await createToy(owner);

    const first = await open(renter, 'TOY', toyId);
    expect(first.status).toBe(201);
    expect(first.body.data.created).toBe(true);
    const conversation = first.body.data.conversation;
    expect(conversation.subject).toEqual({ kind: 'TOY', id: toyId, code: null, status: null });
    expect(conversation.counterpart.id).toBe(owner);
    expect(conversation.toy).toMatchObject({ id: toyId, title: 'Bộ Lego Classic' });
    expect(conversation.readOnly).toBe(false);

    const again = await open(renter, 'TOY', toyId);
    expect(again.status).toBe(200);
    expect(again.body.data.conversation.id).toBe(conversation.id);

    const another = await open(other, 'TOY', toyId);
    expect(another.status).toBe(201);
    expect(another.body.data.conversation.id).not.toBe(conversation.id);
  });

  it('refuses a chat with yourself and a listing that is not visible', async () => {
    const owner = await createUser();
    const renter = await createUser();
    const toyId = await createToy(owner);
    expect((await open(owner, 'TOY', toyId)).body.error.code).toBe('CHAT_WITH_SELF');

    const pending = await createToy(owner, 'pending');
    const hidden = await createToy(owner, 'hidden');
    for (const id of [pending, hidden, String(newId())]) {
      const res = await open(renter, 'TOY', id);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TOY_NOT_FOUND');
    }
  });

  it('gives both parties of an order the same chat and refuses everyone else', async () => {
    const renter = await createUser();
    const owner = await createUser();
    const stranger = await createUser();
    const orderId = await createRental(renter, owner, 'PAID', now, 'RO-OPEN-1');

    const byRenter = await open(renter, 'RENTAL_ORDER', orderId);
    expect(byRenter.status).toBe(201);
    expect(byRenter.body.data.conversation.subject).toEqual({
      kind: 'RENTAL_ORDER',
      id: orderId,
      code: 'RO-OPEN-1',
      status: 'PAID',
    });
    const byOwner = await open(owner, 'RENTAL_ORDER', orderId);
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.data.conversation.id).toBe(byRenter.body.data.conversation.id);
    expect(byOwner.body.data.conversation.counterpart.id).toBe(renter);

    expect((await open(stranger, 'RENTAL_ORDER', orderId)).status).toBe(403);
    const missing = await open(renter, 'RENTAL_ORDER', String(newId()));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('RENTAL_NOT_FOUND');
    expect(await Conversation.countDocuments({ 'context.id': new Types.ObjectId(orderId) })).toBe(
      1,
    );
  });

  it('opens the chat of a purchase order for the buyer and the seller', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const orderId = await createPurchase(buyer, seller);
    const res = await open(seller, 'PURCHASE_ORDER', orderId);
    expect(res.status).toBe(201);
    expect(res.body.data.conversation.subject.kind).toBe('PURCHASE_ORDER');
    expect(res.body.data.conversation.counterpart.id).toBe(buyer);
    expect((await open(await createUser(), 'PURCHASE_ORDER', orderId)).status).toBe(403);
  });

  it('validates the body and requires a signed-in User', async () => {
    const user = await createUser();
    const bad = await request(app)
      .post('/api/v1/conversations')
      .set(as(user))
      .send({ kind: 'DONATION', id: 'x' });
    expect(bad.status).toBe(400);
    expect((await request(app).post('/api/v1/conversations').send({})).status).toBe(401);
    const admin = await request(app)
      .get('/api/v1/conversations')
      .set({ ...as(user), 'x-test-role': 'ADMIN' });
    expect(admin.status).toBe(403);
  });
});

// ---- send + masking --------------------------------------------------------------------------

describe('POST /conversations/:id/messages', () => {
  it('stores a plain message and pushes it to both parties', async () => {
    const { renter, owner, conversationId } = await rentalChat();
    const res = await send(renter, conversationId, { text: '  Chào bạn,\nmai mình nhận đồ nhé ' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      conversationId,
      senderId: renter,
      text: 'Chào bạn,\nmai mình nhận đồ nhé',
      images: [],
      masked: false,
      maskedKinds: [],
      isRead: false,
    });
    expect(realtime.events).toEqual([
      {
        userIds: [renter, owner],
        event: 'chat:message',
        payload: { conversationId, message: res.body.data },
      },
    ]);
  });

  it('masks contact details, flags the message and logs the masking without the text', async () => {
    const { renter, conversationId } = await rentalChat();
    const res = await send(renter, conversationId, {
      text: 'Gọi 0912 345 678 hoặc mail lan@gmail.com, STK 0451000123456, https://zalo.me/lan',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.text).toBe('Gọi *** hoặc mail ***, STK ***, ***');
    expect(res.body.data.masked).toBe(true);
    expect([...res.body.data.maskedKinds].sort()).toEqual([
      'BANK_ACCOUNT',
      'EMAIL',
      'LINK',
      'PHONE',
    ]);

    const stored = await Message.findById(res.body.data.id).lean();
    expect(stored?.content).toBe('Gọi *** hoặc mail ***, STK ***, ***');
    expect(stored?.hasSensitiveInfo).toBe(true);
    expect(JSON.stringify(stored)).not.toMatch(/0912|lan@|zalo/);

    const logs = await AuditLog.find({ target_id: new Types.ObjectId(res.body.data.id) }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: 'chat.contact_masked', target_type: 'MESSAGE' });
    expect(String(logs[0]?.actor_id)).toBe(renter);
    expect(JSON.stringify(logs[0])).not.toMatch(/0912|lan@/);

    const plain = await send(renter, conversationId, { text: 'Cảm ơn bạn' });
    expect(
      await AuditLog.countDocuments({ target_id: new Types.ObjectId(plain.body.data.id) }),
    ).toBe(0);
  });

  it('accepts up to 5 own CHAT_IMAGE uploads and refuses other images', async () => {
    const { renter, owner, conversationId } = await rentalChat();
    const image = (uploader: string, n: number) => ({
      publicId: `toyflow/chat/${uploader}/img${n}`,
      format: 'JPG',
    });

    const ok = await send(renter, conversationId, { images: [image(renter, 1), image(renter, 2)] });
    expect(ok.status).toBe(201);
    expect(ok.body.data.text).toBe('');
    expect(ok.body.data.images).toHaveLength(2);
    const stored = await Message.findById(ok.body.data.id).lean();
    expect(stored?.images).toEqual([
      `toyflow/chat/${renter}/img1.jpg`,
      `toyflow/chat/${renter}/img2.jpg`,
    ]);

    const foreign = await send(renter, conversationId, { images: [image(owner, 3)] });
    expect(foreign.status).toBe(422);
    expect(foreign.body.error.code).toBe('CHAT_IMAGE_NOT_OWNED');

    const wrongPurpose = await send(renter, conversationId, {
      images: [{ publicId: `toyflow/toys/${renter}/a`, format: 'jpg' }],
    });
    expect(wrongPurpose.status).toBe(400);
    const tooMany = await send(renter, conversationId, {
      images: [1, 2, 3, 4, 5, 6].map((n) => image(renter, n)),
    });
    expect(tooMany.status).toBe(400);
    const gif = await send(renter, conversationId, {
      images: [{ ...image(renter, 7), format: 'gif' }],
    });
    expect(gif.status).toBe(400);
  });

  it('refuses an empty or too long message and a non-participant', async () => {
    const { renter, conversationId } = await rentalChat();
    expect((await send(renter, conversationId, { text: '   ' })).status).toBe(400);
    expect((await send(renter, conversationId, {})).status).toBe(400);
    expect((await send(renter, conversationId, { text: 'a'.repeat(1001) })).status).toBe(400);
    expect((await send(renter, conversationId, { text: 'a'.repeat(1000) })).status).toBe(201);

    const stranger = await createUser();
    const res = await send(stranger, conversationId, { text: 'Xin chào' });
    expect(res.status).toBe(403);
    expect(
      (await request(app).get(`/api/v1/conversations/${conversationId}`).set(as(stranger))).status,
    ).toBe(403);
    expect((await send(renter, String(newId()), { text: 'Xin chào' })).status).toBe(404);
  });
});

// ---- read-only after the order ends ----------------------------------------------------------

describe('read-only order chat', () => {
  it('stays writable while the order runs and for 7 days after it ends', async () => {
    const renter = await createUser();
    const owner = await createUser();
    const ended = new Date(now.getTime() - 2 * DAY);
    const orderId = await createRental(renter, owner, 'COMPLETED', ended);
    const opened = await open(owner, 'RENTAL_ORDER', orderId);
    const conversation = opened.body.data.conversation;
    expect(conversation.readOnly).toBe(false);
    expect(conversation.closesAt).toBe(new Date(ended.getTime() + 7 * DAY).toISOString());
    expect((await send(owner, conversation.id, { text: 'Cảm ơn bạn đã thuê' })).status).toBe(201);

    // 7 days after the end: read-only, history still readable.
    now = new Date(ended.getTime() + 7 * DAY);
    const closed = await send(renter, conversation.id, { text: 'Cho mình hỏi thêm' });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('CHAT_CLOSED');
    const room = await request(app).get(`/api/v1/conversations/${conversation.id}`).set(as(renter));
    expect(room.body.data.readOnly).toBe(true);
    const history = await request(app)
      .get(`/api/v1/conversations/${conversation.id}/messages`)
      .set(as(renter));
    expect(history.body.data.items).toHaveLength(1);
  });

  it.each(['CANCELLED', 'REJECTED', 'EXPIRED'])('closes a %s rental chat too', async (status) => {
    const renter = await createUser();
    const owner = await createUser();
    const orderId = await createRental(renter, owner, status, new Date(now.getTime() - 8 * DAY));
    const opened = await open(renter, 'RENTAL_ORDER', orderId);
    expect(opened.body.data.conversation.readOnly).toBe(true);
    expect((await send(renter, opened.body.data.conversation.id, { text: 'Hi' })).status).toBe(409);
  });

  it('keeps a disputed order open and closes a completed purchase (any case)', async () => {
    const renter = await createUser();
    const owner = await createUser();
    const old = new Date(now.getTime() - 30 * DAY);
    const disputed = await createRental(renter, owner, 'DISPUTING', old);
    const res = await open(renter, 'RENTAL_ORDER', disputed);
    expect(res.body.data.conversation).toMatchObject({ readOnly: false, closesAt: null });

    const purchaseId = await createPurchase(renter, owner, 'completed');
    await PurchaseOrder.collection.updateOne(
      { _id: new Types.ObjectId(purchaseId) },
      { $set: { updatedAt: old } },
    );
    const purchase = await open(renter, 'PURCHASE_ORDER', purchaseId);
    expect(purchase.body.data.conversation.readOnly).toBe(true);
  });

  it('never closes a listing chat', async () => {
    const owner = await createUser();
    const renter = await createUser();
    const res = await open(renter, 'TOY', await createToy(owner));
    now = new Date(now.getTime() + 365 * DAY);
    expect((await send(owner, res.body.data.conversation.id, { text: 'Còn nhé' })).status).toBe(
      201,
    );
  });
});

// ---- history, inbox, read --------------------------------------------------------------------

describe('history, inbox and read receipts', () => {
  it('loads the latest 50 messages, then older ones with the cursor', async () => {
    const { renter, owner, conversationId } = await rentalChat();
    const base = now.getTime();
    await Message.insertMany(
      Array.from({ length: 55 }, (_, i) => ({
        conversationId: new Types.ObjectId(conversationId),
        senderId: new Types.ObjectId(i % 2 ? owner : renter),
        content: `Tin ${i + 1}`,
        createdAt: new Date(base + i * 1000),
      })),
    );
    const url = `/api/v1/conversations/${conversationId}/messages`;
    const first = await request(app).get(url).set(as(owner));
    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(50);
    expect(first.body.data.items[0].text).toBe('Tin 6');
    expect(first.body.data.items[49].text).toBe('Tin 55');
    expect(first.body.data.hasMore).toBe(true);
    expect(first.body.data.nextCursor).toBe(first.body.data.items[0].id);

    const second = await request(app)
      .get(url)
      .query({ before: first.body.data.nextCursor })
      .set(as(owner));
    expect(second.body.data.items.map((m: any) => m.text)).toEqual([
      'Tin 1',
      'Tin 2',
      'Tin 3',
      'Tin 4',
      'Tin 5',
    ]);
    expect(second.body.data).toMatchObject({ hasMore: false, nextCursor: null });

    const unknownCursor = await request(app)
      .get(url)
      .query({ before: String(newId()) })
      .set(as(owner));
    expect(unknownCursor.status).toBe(404);
    expect((await request(app).get(url).query({ limit: 51 }).set(as(owner))).status).toBe(400);
  });

  it('lists my conversations with the last message, unread count and search', async () => {
    const lan = await createUser('Trần Thị Lan');
    const minh = await createUser('Phạm Văn Minh');
    const hoa = await createUser('Lê Hoa');
    const orderId = await createRental(lan, minh, 'PAID', now, 'RO-SEARCH-77');
    const withMinh = (await open(lan, 'RENTAL_ORDER', orderId)).body.data.conversation.id;
    const withHoa = (await open(lan, 'TOY', await createToy(hoa))).body.data.conversation.id;
    // An empty listing chat is not in the inbox yet.
    const emptyInbox = await request(app).get('/api/v1/conversations').set(as(hoa));
    expect(emptyInbox.body.data).toEqual([]);

    await send(minh, withMinh, { text: 'Gọi mình 0912345678' });
    now = new Date(now.getTime() + 1000);
    await send(minh, withMinh, { text: 'Bạn nhận được chưa?' });
    now = new Date(now.getTime() + 1000);
    await send(hoa, withHoa, { text: 'Đồ còn nhé' });

    const inbox = await request(app).get('/api/v1/conversations').set(as(lan));
    expect(inbox.status).toBe(200);
    expect(inbox.body.pagination.totalItems).toBe(2);
    const [latest, older] = inbox.body.data;
    expect(latest.id).toBe(withHoa);
    expect(older).toMatchObject({
      id: withMinh,
      unreadCount: 2,
      counterpart: { id: minh, fullName: 'Phạm Văn Minh' },
      lastMessage: { senderId: minh, preview: 'Bạn nhận được chưa?', imageCount: 0 },
    });

    const byName = await request(app)
      .get('/api/v1/conversations')
      .query({ search: 'pham van' })
      .set(as(lan));
    expect(byName.body.data.map((c: any) => c.id)).toEqual([withMinh]);
    const byCode = await request(app)
      .get('/api/v1/conversations')
      .query({ search: 'search-77' })
      .set(as(lan));
    expect(byCode.body.data.map((c: any) => c.id)).toEqual([withMinh]);
    // Searching my own name finds nothing: only the counterpart's name counts.
    const own = await request(app)
      .get('/api/v1/conversations')
      .query({ search: 'Trần Thị Lan' })
      .set(as(lan));
    expect(own.body.data).toEqual([]);

    const count = await request(app).get('/api/v1/conversations/unread-count').set(as(lan));
    expect(count.body.data).toEqual({ count: 3 });
  });

  it('marks the received messages read and sends a read receipt', async () => {
    const { renter, owner, conversationId } = await rentalChat();
    await send(renter, conversationId, { text: 'Tin 1' });
    await send(renter, conversationId, { text: 'Tin 2' });
    await send(owner, conversationId, { text: 'Trả lời' });
    realtime.events = [];

    const res = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/read`)
      .set(as(owner));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updatedCount: 2, readAt: now.toISOString() });
    expect(realtime.events).toEqual([
      {
        userIds: [renter, owner],
        event: 'chat:read',
        payload: { conversationId, readerId: owner, readAt: now.toISOString() },
      },
    ]);
    // The owner's own message stays unread until the renter reads it.
    expect(await Message.countDocuments({ conversationId, isRead: false })).toBe(1);

    realtime.events = [];
    const again = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/read`)
      .set(as(owner));
    expect(again.body.data.updatedCount).toBe(0);
    expect(realtime.events).toEqual([]);
  });
});

// ---- offline notification --------------------------------------------------------------------

describe('offline recipient', () => {
  it('gets one in-app notification per unread streak, never an online recipient', async () => {
    const { renter, owner, conversationId } = await rentalChat();
    await send(renter, conversationId, { text: 'Mai bạn rảnh không? SĐT 0912345678' });
    await send(renter, conversationId, { text: 'Mình qua lấy nhé' });
    await waitFor(async () => notices.length === 1);
    expect(notices[0]).toEqual({
      type: 'NOTIFY',
      notificationType: 'CHAT_MESSAGE',
      to: owner,
      title: 'Tin nhắn mới từ Trần Thị Lan',
      body: 'Trần Thị Lan: Mai bạn rảnh không? SĐT *** Mở Tin nhắn trên ToyFlow để trả lời.',
      link: `/chat/${conversationId}`,
      email: false,
      actorId: renter,
    });
    // Stored by the notification service (in-app only).
    const owners = { userId: new Types.ObjectId(owner) };
    await waitFor(async () => (await Notification.countDocuments(owners)) === 1);
    const stored = await Notification.findOne(owners).lean();
    expect(stored).toMatchObject({ type: 'CHAT_MESSAGE', link: `/chat/${conversationId}` });
    expect(stored?.body).not.toContain('0912');

    // After reading, a new message starts a new streak.
    await request(app).patch(`/api/v1/conversations/${conversationId}/read`).set(as(owner));
    await send(renter, conversationId, {
      images: [{ publicId: `toyflow/chat/${renter}/a`, format: 'png' }],
    });
    await waitFor(async () => notices.length === 2);
    expect(notices[1]?.body).toBe('Trần Thị Lan: [1 ảnh] Mở Tin nhắn trên ToyFlow để trả lời.');

    // Online: pushed over the socket only.
    realtime.online.add(renter);
    await send(owner, conversationId, { text: 'Ok bạn' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(notices).toHaveLength(2);
  });

  it('renders the notification text', () => {
    const notice = {
      recipientId: String(newId()),
      senderId: String(newId()),
      conversationId: '67098e1b34e12c001a123456',
      imageCount: 0,
    };
    expect(renderChatMessage({ ...notice, senderName: 'Lan', preview: 'Chào' })).toEqual({
      title: 'Tin nhắn mới từ Lan',
      body: 'Lan: Chào Mở Tin nhắn trên ToyFlow để trả lời.',
    });
    expect(
      renderChatMessage({ ...notice, senderName: 'L'.repeat(100), preview: '' }).title,
    ).toHaveLength('Tin nhắn mới từ '.length + 80);
  });
});

// ---- socket handlers -------------------------------------------------------------------------

describe('chat socket handlers', () => {
  it('join checks the participant, send and read answer the ack shape', async () => {
    const { renter, owner, conversationId } = await rentalChat();
    const handlers = createChatSocketHandlers(service);
    const rooms: string[] = [];

    const joined = await handlers.join(renter, { conversationId }, (room) => rooms.push(room));
    expect(joined).toMatchObject({ ok: true, data: { id: conversationId } });
    expect(rooms).toEqual([`conversation:${conversationId}`]);

    const stranger = await createUser();
    const refused = await handlers.join(stranger, { conversationId }, (room) => rooms.push(room));
    expect(refused).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(rooms).toHaveLength(1);

    const sent = await handlers.send(renter, { conversationId, text: 'mail lan@gmail.com' });
    expect(sent).toMatchObject({ ok: true, data: { text: 'mail ***', masked: true } });
    const invalid = await handlers.send(renter, { conversationId, text: '' });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    const noRoom = await handlers.send(renter, { text: 'Hi' });
    expect(noRoom).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });

    const read = await handlers.read(owner, { conversationId });
    expect(read).toMatchObject({ ok: true, data: { updatedCount: 1 } });
  });
});

import { Types, type FilterQuery } from 'mongoose';

import type { ChatOrderKind, MaskedContactKind } from '../constants/chat.js';
import { Conversation, ONE_PER_ORDER_INDEX, type IConversation } from '../models/conversation.model.js';
import { Message, type IMessage } from '../models/message.model.js';
import { PurchaseOrder } from '../models/purchase-order.model.js';
import { RentalOrder } from '../models/rental-order.model.js';
import { Toy } from '../models/toy.model.js';
import { User } from '../models/user.model.js';
import { isDuplicateKeyError } from '../utils/mongo-errors.js';

// MongoDB queries of the chat (UC25). Orders and toys are only read here.

const oid = (id: string | Types.ObjectId): Types.ObjectId =>
  typeof id === 'string' ? new Types.ObjectId(id) : id;

export type ConversationRecord = IConversation;
export type MessageRecord = IMessage;

export interface ChatToy {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  title: string;
  status: string;
  images?: { url: string }[];
}

/** The two parties of an order and what decides whether its chat is still open. */
export interface ChatOrder {
  kind: ChatOrderKind;
  id: string;
  code: string;
  status: string;
  partyIds: [string, string];
  toyId: string;
  updatedAt: Date;
}

export interface ChatUser {
  _id: Types.ObjectId;
  fullName: string;
  avatar?: string;
}

const toyProjection = { ownerId: 1, title: 1, status: 1, images: { $slice: 1 } } as const;

export const findToy = (toyId: string) => Toy.findById(toyId, toyProjection).lean<ChatToy>().exec();

const orderFields = { code: 1, status: 1, toyId: 1, updatedAt: 1 } as const;

interface RentalRow {
  _id: Types.ObjectId;
  code: string;
  status: string;
  toyId: Types.ObjectId;
  renterId: Types.ObjectId;
  ownerId: Types.ObjectId;
  updatedAt: Date;
}

interface PurchaseRow {
  _id: Types.ObjectId;
  code: string;
  status: string;
  toyId: Types.ObjectId;
  buyerId: Types.ObjectId;
  sellerId: Types.ObjectId;
  updatedAt: Date;
}

const fromRental = (row: RentalRow): ChatOrder => ({
  kind: 'RENTAL_ORDER',
  id: String(row._id),
  code: row.code,
  status: row.status,
  partyIds: [String(row.renterId), String(row.ownerId)],
  toyId: String(row.toyId),
  updatedAt: row.updatedAt,
});

const fromPurchase = (row: PurchaseRow): ChatOrder => ({
  kind: 'PURCHASE_ORDER',
  id: String(row._id),
  code: row.code,
  status: row.status,
  partyIds: [String(row.buyerId), String(row.sellerId)],
  toyId: String(row.toyId),
  updatedAt: row.updatedAt,
});

/** The orders with these ids, keyed "<kind>:<id>". */
export const findOrders = async (
  refs: readonly { kind: ChatOrderKind; id: string }[],
): Promise<Map<string, ChatOrder>> => {
  const idsOf = (kind: ChatOrderKind) =>
    refs.filter((ref) => ref.kind === kind).map((ref) => oid(ref.id));
  const rentalIds = idsOf('RENTAL_ORDER');
  const purchaseIds = idsOf('PURCHASE_ORDER');
  const [rentals, purchases] = await Promise.all([
    rentalIds.length
      ? RentalOrder.find({ _id: { $in: rentalIds } }, { ...orderFields, renterId: 1, ownerId: 1 })
          .lean<RentalRow[]>()
          .exec()
      : [],
    purchaseIds.length
      ? PurchaseOrder.find(
          { _id: { $in: purchaseIds } },
          { ...orderFields, buyerId: 1, sellerId: 1 },
        )
          .lean<PurchaseRow[]>()
          .exec()
      : [],
  ]);
  const orders = [...rentals.map(fromRental), ...purchases.map(fromPurchase)];
  return new Map(orders.map((order) => [`${order.kind}:${order.id}`, order]));
};

export const findOrder = async (kind: ChatOrderKind, id: string): Promise<ChatOrder | undefined> =>
  (await findOrders([{ kind, id }])).get(`${kind}:${id}`);

export const findUsers = async (ids: readonly string[]): Promise<Map<string, ChatUser>> => {
  if (ids.length === 0) return new Map();
  const users = await User.find(
    { _id: { $in: [...new Set(ids)].map(oid) } },
    { fullName: 1, avatar: 1 },
  )
    .lean<ChatUser[]>()
    .exec();
  return new Map(users.map((user) => [String(user._id), user]));
};

export const findToys = async (ids: readonly string[]): Promise<Map<string, ChatToy>> => {
  if (ids.length === 0) return new Map();
  const toys = await Toy.find({ _id: { $in: [...new Set(ids)].map(oid) } }, toyProjection)
    .lean<ChatToy[]>()
    .exec();
  return new Map(toys.map((toy) => [String(toy._id), toy]));
};

export interface NewConversation {
  participantIds: [string, string];
  toyId?: string;
}

const participantsOf = (ids: readonly string[]) => ids.map((userId) => ({ userId: oid(userId) }));

/**
 * The conversation matching `filter`, created with `fields` when there is none. Two users who
 * open the same chat at the same time get the same conversation (unique index + re-read).
 */
const findOrCreate = async (
  filter: FilterQuery<IConversation>,
  fields: Partial<IConversation>,
): Promise<{ conversation: ConversationRecord; created: boolean }> => {
  const existing = await Conversation.findOne(filter).lean<ConversationRecord>().exec();
  if (existing) return { conversation: existing, created: false };
  try {
    const created = await Conversation.create(fields);
    return { conversation: created.toObject<ConversationRecord>(), created: true };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const conversation = await Conversation.findOne(filter).lean<ConversationRecord>().exec();
    if (!conversation) throw error;
    return { conversation, created: false };
  }
};

export const findOrCreateOrderConversation = (order: ChatOrder) =>
  findOrCreate(
    { 'context.kind': order.kind, 'context.id': oid(order.id) },
    {
      participants: participantsOf(order.partyIds),
      context: { kind: order.kind, id: oid(order.id) },
      toyId: oid(order.toyId),
    },
  );

/** One listing chat per toy and interested user: "<toyId>:<userId>". */
export const listingKeyOf = (toyId: string, userId: string): string => `${toyId}:${userId}`;

export const findOrCreateListingConversation = (toy: ChatToy, userId: string) =>
  findOrCreate(
    { listingKey: listingKeyOf(String(toy._id), userId) },
    {
      participants: participantsOf([userId, String(toy.ownerId)]),
      toyId: toy._id,
      listingKey: listingKeyOf(String(toy._id), userId),
    },
  );

export const findConversation = (id: string) =>
  Conversation.findById(id).lean<ConversationRecord>().exec();

export interface InboxFilter {
  /** Only conversations with one of these counterparts or about one of these orders. */
  counterpartIds?: string[];
  orderIds?: string[];
}

// A listing chat shows in the inbox once it has a message, so pressing "Message" on a listing
// without writing anything does not add an empty row to the owner's inbox. Order chats always
// show: both sides already share the order.
const inboxFilter = (userId: string, filter: InboxFilter): FilterQuery<IConversation> => {
  const and: FilterQuery<IConversation>[] = [
    { 'participants.userId': oid(userId) },
    { $or: [{ lastMessageAt: { $exists: true } }, { 'context.id': { $exists: true } }] },
  ];
  if (filter.counterpartIds || filter.orderIds) {
    and.push({
      $or: [
        {
          participants: {
            $elemMatch: {
              userId: { $in: (filter.counterpartIds ?? []).map(oid), $ne: oid(userId) },
            },
          },
        },
        { 'context.id': { $in: (filter.orderIds ?? []).map(oid) } },
      ],
    });
  }
  return { $and: and };
};

/** The user's conversations, the most recent message first (order chats without messages last). */
export const findInbox = async (
  userId: string,
  filter: InboxFilter,
  paging: { skip: number; limit: number },
) => {
  const query = inboxFilter(userId, filter);
  const [items, totalItems] = await Promise.all([
    Conversation.find(query)
      .sort({ lastMessageAt: -1, _id: -1 })
      .skip(paging.skip)
      .limit(paging.limit)
      .lean<ConversationRecord[]>()
      .exec(),
    Conversation.countDocuments(query).exec(),
  ]);
  return { items, totalItems };
};

/** Ids of users whose name matches the search (accent-insensitive RegExp source). */
export const findUserIdsByName = async (pattern: string): Promise<string[]> => {
  const users = await User.find({ fullName: { $regex: pattern, $options: 'i' } }, { _id: 1 })
    .limit(200)
    .lean<{ _id: Types.ObjectId }[]>()
    .exec();
  return users.map((user) => String(user._id));
};

/** Ids of the user's orders whose code matches the search. */
export const findOrderIdsByCode = async (userId: string, pattern: string): Promise<string[]> => {
  const id = oid(userId);
  const code = { $regex: pattern, $options: 'i' };
  const [rentals, purchases] = await Promise.all([
    RentalOrder.find({ code, $or: [{ renterId: id }, { ownerId: id }] }, { _id: 1 })
      .limit(200)
      .lean<{ _id: Types.ObjectId }[]>()
      .exec(),
    PurchaseOrder.find({ code, $or: [{ buyerId: id }, { sellerId: id }] }, { _id: 1 })
      .limit(200)
      .lean<{ _id: Types.ObjectId }[]>()
      .exec(),
  ]);
  return [...rentals, ...purchases].map((order) => String(order._id));
};

/** Unread messages sent to the user, per conversation. */
export const countUnreadByConversation = async (
  userId: string,
  conversationIds: readonly Types.ObjectId[],
): Promise<Map<string, number>> => {
  if (conversationIds.length === 0) return new Map();
  const rows = await Message.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        conversationId: { $in: [...conversationIds] },
        senderId: { $ne: oid(userId) },
        isRead: false,
      },
    },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } },
  ]).exec();
  return new Map(rows.map((row) => [String(row._id), row.count]));
};

/** Unread messages sent to the user in all of their conversations. */
export const countUnreadTotal = async (userId: string): Promise<number> => {
  const conversations = await Conversation.find({ 'participants.userId': oid(userId) }, { _id: 1 })
    .lean<{ _id: Types.ObjectId }[]>()
    .exec();
  if (conversations.length === 0) return 0;
  return Message.countDocuments({
    conversationId: { $in: conversations.map((conversation) => conversation._id) },
    senderId: { $ne: oid(userId) },
    isRead: false,
  }).exec();
};

export interface NewMessage {
  conversationId: Types.ObjectId;
  senderId: string;
  content: string;
  images: string[];
  maskedKinds: MaskedContactKind[];
}

export const insertMessage = async (data: NewMessage): Promise<MessageRecord> => {
  const created = await Message.create({
    conversationId: data.conversationId,
    senderId: oid(data.senderId),
    content: data.content,
    images: data.images,
    hasSensitiveInfo: data.maskedKinds.length > 0,
    maskedKinds: data.maskedKinds,
  });
  return created.toObject<MessageRecord>();
};

export const setLastMessage = (
  conversationId: Types.ObjectId,
  message: MessageRecord,
  preview: string,
) =>
  Conversation.updateOne(
    { _id: conversationId },
    {
      $set: {
        lastMessageAt: message.createdAt,
        lastMessage: {
          messageId: message._id,
          senderId: message.senderId,
          preview,
          imageCount: message.images.length,
        },
      },
    },
  ).exec();

/** Unread messages of this sender in the conversation. */
export const countUnreadFrom = (conversationId: Types.ObjectId, senderId: string) =>
  Message.countDocuments({ conversationId, senderId: oid(senderId), isRead: false }).exec();

/**
 * One page of the room history, newest first: the `limit` messages sent before `before`
 * (a message of this conversation), or the latest ones.
 */
export const findMessagesPage = async (
  conversationId: Types.ObjectId,
  before: MessageRecord | null,
  limit: number,
): Promise<MessageRecord[]> => {
  const query: FilterQuery<IMessage> = { conversationId };
  if (before) {
    query.$or = [
      { createdAt: { $lt: before.createdAt } },
      { createdAt: before.createdAt, _id: { $lt: before._id } },
    ];
  }
  return Message.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean<MessageRecord[]>()
    .exec();
};

export const findMessageIn = (conversationId: Types.ObjectId, messageId: string) =>
  Message.findOne({ _id: oid(messageId), conversationId })
    .lean<MessageRecord>()
    .exec();

/** Marks every message the other party sent as read; returns how many changed. */
export const markReadFor = async (
  conversationId: Types.ObjectId,
  readerId: string,
  readAt: Date,
): Promise<number> => {
  const result = await Message.updateMany(
    { conversationId, senderId: { $ne: oid(readerId) }, isRead: false },
    { $set: { isRead: true, readAt } },
  ).exec();
  return result.modifiedCount;
};

/**
 * Replaces an `one_per_order` index built without the partial filter (an older schema): that
 * index treats every listing chat as the same { null, null } key, so a second listing chat fails
 * with E11000. Leaves a correct index alone, so it is safe to run again.
 */
export async function rebuildOnePerOrderIndex(): Promise<{ rebuilt: boolean }> {
  const collection = Conversation.collection;
  const { name } = ONE_PER_ORDER_INDEX.options;
  const current = (await collection.indexes()).find((index) => index.name === name);
  if (current?.partialFilterExpression) return { rebuilt: false };
  if (current) await collection.dropIndex(name);
  await collection.createIndex(ONE_PER_ORDER_INDEX.key, { ...ONE_PER_ORDER_INDEX.options });
  return { rebuilt: true };
}

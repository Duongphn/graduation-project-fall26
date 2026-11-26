import mongoose, { type Model, Schema, type Types } from 'mongoose';

import { chatOrderKinds, type ChatOrderKind } from '../constants/chat.js';

// A chat room between two users about a toy listing or an order (R03 Conversation, UC25).
// - Order chat: `context` holds the order; one conversation per order (index one_per_order).
// - Listing chat (before ordering): no `context`; `listingKey` "<toyId>:<userId of the
//   interested user>" makes it one conversation per listing and user.
export interface IConversation {
  _id: Types.ObjectId;
  participants: { userId: Types.ObjectId }[];
  context?: { kind?: ChatOrderKind; id?: Types.ObjectId };
  toyId?: Types.ObjectId;
  listingKey?: string;
  lastMessageAt?: Date;
  lastMessage?: {
    messageId: Types.ObjectId;
    senderId: Types.ObjectId;
    preview: string;
    imageCount: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    participants: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      },
    ],
    context: {
      kind: { type: String, enum: chatOrderKinds },
      id: { type: Schema.Types.ObjectId },
    },
    toyId: { type: Schema.Types.ObjectId, ref: 'Toy' },
    listingKey: { type: String },
    lastMessageAt: { type: Date },
    lastMessage: {
      type: new Schema(
        {
          messageId: { type: Schema.Types.ObjectId, required: true },
          senderId: { type: Schema.Types.ObjectId, required: true },
          preview: { type: String, default: '' },
          imageCount: { type: Number, default: 0 },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ với Atlas
// Only order chats are unique by context. A partial filter (not `sparse`) so listing chats, saved
// without `context` or with `context: null`, never collide on { null, null }.
export const ONE_PER_ORDER_INDEX = {
  key: { 'context.kind': 1, 'context.id': 1 },
  options: {
    unique: true,
    partialFilterExpression: { 'context.id': { $exists: true } },
    name: 'one_per_order',
  },
} as const;
conversationSchema.index(ONE_PER_ORDER_INDEX.key, ONE_PER_ORDER_INDEX.options);
conversationSchema.index({ 'participants.userId': 1, lastMessageAt: -1 }, { name: 'inbox' });
conversationSchema.index(
  { listingKey: 1 },
  {
    unique: true,
    partialFilterExpression: { listingKey: { $exists: true } },
    name: 'one_per_listing_user',
  },
);

export const Conversation: Model<IConversation> =
  (mongoose.models.Conversation as Model<IConversation>) ||
  mongoose.model<IConversation>('Conversation', conversationSchema);

export default Conversation;

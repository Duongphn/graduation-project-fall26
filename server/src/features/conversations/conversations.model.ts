import { Schema, model, type InferSchemaType } from 'mongoose';

import { orderTypes } from '../../shared/contracts/order-status-change.js';

// FE-10: one chat room per booking or order, between its two parties.
const participantSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastReadAt: { type: Date },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    participants: {
      type: [participantSchema],
      validate: {
        validator: (value: { userId: { equals(other: unknown): boolean } }[]) =>
          value.length === 2 && !value[0]?.userId.equals(value[1]?.userId),
        message: 'A conversation has exactly two different participants.',
      },
    },
    context: {
      kind: { type: String, enum: orderTypes, required: true },
      id: { type: Schema.Types.ObjectId, required: true },
    },
    lastMessageAt: { type: Date },
  },
  { collection: 'conversations', timestamps: true },
);

conversationSchema.index(
  { 'context.kind': 1, 'context.id': 1 },
  { unique: true, name: 'one_per_order' },
);
conversationSchema.index({ 'participants.userId': 1, lastMessageAt: -1 }, { name: 'inbox' });

export type Conversation = InferSchemaType<typeof conversationSchema>;
export const ConversationModel = model('Conversation', conversationSchema);

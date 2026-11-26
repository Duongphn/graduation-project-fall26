import mongoose, { type Model, Schema, type Types } from 'mongoose';

import { maskedContactKinds, type MaskedContactKind } from '../constants/chat.js';

// One text and/or image message in a conversation (R03 Message, UC25). `content` is stored
// already masked (GB-11): the phone numbers, emails, links and bank account numbers it held are
// never saved. Images are private Cloudinary uploads stored as "<publicId>.<format>".
export interface IMessage {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  content: string;
  images: string[];
  hasSensitiveInfo: boolean;
  maskedKinds: MaskedContactKind[];
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    images: { type: [String], default: [] },
    hasSensitiveInfo: { type: Boolean, required: true, default: false },
    maskedKinds: { type: [String], enum: maskedContactKinds, default: [] },
    isRead: { type: Boolean, required: true, default: false },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo Index đồng bộ tuyệt đối với Atlas
messageSchema.index({ conversationId: 1, createdAt: -1 }, { name: 'room_history' });

export const Message: Model<IMessage> =
  (mongoose.models.Message as Model<IMessage>) ||
  mongoose.model<IMessage>('Message', messageSchema);

export default Message;

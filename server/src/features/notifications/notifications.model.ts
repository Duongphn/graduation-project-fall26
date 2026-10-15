import { Schema, model, type InferSchemaType } from 'mongoose';

import { referenceSchema } from '../../infrastructure/database/schema-types.js';
import { notificationTypes } from '../../shared/domain/enums.js';

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: notificationTypes, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    // The order, toy, dispute... the notification opens.
    target: { type: referenceSchema },
    isRead: { type: Boolean, required: true, default: false },
  },
  { collection: 'notifications', timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_feed' });
notificationSchema.index(
  { userId: 1 },
  { partialFilterExpression: { isRead: false }, name: 'unread_count' },
);
// Notifications are kept for 30 days.
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 2_592_000, name: 'retention_ttl' },
);

export type Notification = InferSchemaType<typeof notificationSchema>;
export const NotificationModel = model('Notification', notificationSchema);

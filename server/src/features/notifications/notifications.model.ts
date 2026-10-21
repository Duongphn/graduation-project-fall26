import mongoose, { type Model, Schema } from 'mongoose';

export interface INotification {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, required: true },
    isRead: { type: Boolean, required: true, default: false },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

notificationSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_feed' });
notificationSchema.index(
  { userId: 1 },
  { partialFilterExpression: { isRead: false }, name: 'unread_count' },
);
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 2592000, name: 'retention_ttl' },
);

export const Notification: Model<INotification> =
  (mongoose.models.Notification as Model<INotification>) ||
  mongoose.model<INotification>('Notification', notificationSchema);

export default Notification;
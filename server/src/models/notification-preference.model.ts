import mongoose, { type Model, Schema } from 'mongoose';

// The notification types a user has turned off (UC26). Only types marked mutable in
// constants/notification-types.ts are stored; no document means nothing is turned off.
export interface INotificationPreference {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  mutedTypes: string[];
  createdAt: Date;
  updatedAt: Date;
}

const notificationPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    mutedTypes: { type: [String], default: [] },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

export const NotificationPreference: Model<INotificationPreference> =
  (mongoose.models.NotificationPreference as Model<INotificationPreference>) ||
  mongoose.model<INotificationPreference>('NotificationPreference', notificationPreferenceSchema);

export default NotificationPreference;

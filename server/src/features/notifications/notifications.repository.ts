import { Types } from 'mongoose';

import type { NotificationType } from '../../shared/domain/enums.js';
import { OrganizationModel } from '../organizations/organizations.model.js';
import { UserModel } from '../users/users.model.js';
import type { NotificationTarget } from './notification-templates.js';
import { NotificationModel } from './notifications.model.js';

export interface NotificationRecord {
  _id: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  target?: { kind: NotificationTarget['kind']; id: Types.ObjectId } | null;
  isRead: boolean;
  createdAt: Date;
}

export interface NewNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  target: NotificationTarget;
}

const projection = { userId: 0 } as const;

/** Only the email address: notification code never needs the rest of the profile. */
export const findRecipientEmail = async (userId: string): Promise<string | null | undefined> => {
  const user = await UserModel.findById(userId).select({ email: 1 }).lean<{ email?: string }>();
  return user ? (user.email ?? null) : undefined;
};

/** Every active Admin (the requester side of an ORGANIZATION donation request). */
export const findActiveAdminIds = async (): Promise<string[]> =>
  (await UserModel.find({ role: 'ADMIN', status: 'ACTIVE' }).select({ _id: 1 }).lean()).map(
    (user) => String(user._id),
  );

export const findOrganizationName = async (organizationId: string): Promise<string | undefined> => {
  const organization = await OrganizationModel.findById(organizationId)
    .select({ name: 1 })
    .lean<{ name?: string }>();
  return organization?.name;
};

export const insertNotification = async (data: NewNotification): Promise<string> => {
  const [created] = await NotificationModel.create([
    {
      userId: new Types.ObjectId(data.userId),
      type: data.type,
      title: data.title,
      body: data.body,
      target: { kind: data.target.kind, id: new Types.ObjectId(data.target.id) },
    },
  ]);
  return String(created!._id);
};

export const findUserNotifications = async (
  userId: string,
  options: { unreadOnly: boolean; skip: number; limit: number; sort: Record<string, 1 | -1> },
): Promise<{ items: NotificationRecord[]; totalItems: number }> => {
  const filter = {
    userId: new Types.ObjectId(userId),
    ...(options.unreadOnly ? { isRead: false } : {}),
  };
  const [items, totalItems] = await Promise.all([
    NotificationModel.find(filter, projection)
      .sort(options.sort)
      .skip(options.skip)
      .limit(options.limit)
      .lean<NotificationRecord[]>(),
    NotificationModel.countDocuments(filter),
  ]);
  return { items, totalItems };
};

export const countUnread = (userId: string): Promise<number> =>
  NotificationModel.countDocuments({ userId: new Types.ObjectId(userId), isRead: false });

/** Idempotent: a read notification stays read; null when it is not this user's. */
export const markRead = (userId: string, id: string) =>
  NotificationModel.findOneAndUpdate(
    { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
    { $set: { isRead: true } },
    { new: true, projection },
  ).lean<NotificationRecord>();

export const markAllRead = async (userId: string): Promise<number> => {
  const result = await NotificationModel.updateMany(
    { userId: new Types.ObjectId(userId), isRead: false },
    { $set: { isRead: true } },
  );
  return result.modifiedCount;
};

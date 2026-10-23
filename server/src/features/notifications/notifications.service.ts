import { notFound } from '../../shared/errors/http-errors.js';
import { toMongoPaging } from '../../shared/utils/response.js';
import { getDefaultMailer, type Mailer } from './mailer.js';
import type { NotificationMessage } from './notification-templates.js';
import * as repository from './notifications.repository.js';
import type { NotificationRecord } from './notifications.repository.js';
import {
  notificationSortFields,
  type ListNotificationsQuery,
  type NotificationDto,
} from './notifications.schemas.js';

// SENT: handed to SMTP. LOGGED: SMTP not configured, only logged. NO_ADDRESS: the user has no
// email. FAILED: the mailer threw (logged; the in-app notification is kept).
export type EmailOutcome = 'SENT' | 'LOGGED' | 'NO_ADDRESS' | 'FAILED';

export interface NotifyUserResult {
  notificationId: string;
  email: EmailOutcome;
}

export interface NotifierOptions {
  /** Defaults to the process-wide mailer (SMTP when configured, otherwise a log line). */
  mailer?: Mailer;
}

// Proposed shared helper: shared/utils/errors.ts.
export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// In-app notification first (always), then the email (best effort: a failed email is logged and
// never undoes the in-app notification).
export const createNotifier = (options: NotifierOptions = {}) => ({
  async notifyUser(userId: string, message: NotificationMessage): Promise<NotifyUserResult | null> {
    const address = await repository.findRecipientEmail(userId);
    if (address === undefined) {
      console.warn(`[notifications] ${message.type} skipped: user ${userId} does not exist.`);
      return null;
    }
    const notificationId = await repository.insertNotification({
      userId,
      type: message.type,
      title: message.title,
      body: message.body,
    });
    if (!address) return { notificationId, email: 'NO_ADDRESS' };
    try {
      const mailer = options.mailer ?? getDefaultMailer();
      const result = await mailer.send({ to: address, ...message.email });
      return { notificationId, email: result.delivered ? 'SENT' : 'LOGGED' };
    } catch (error) {
      console.error(
        `[notifications] Email ${message.type} to user ${userId} failed: ${describeError(error)}`,
      );
      return { notificationId, email: 'FAILED' };
    }
  },
});

const toNotificationDto = (record: NotificationRecord): NotificationDto => ({
  id: String(record._id),
  type: record.type,
  title: record.title,
  body: record.body,
  isRead: record.isRead,
  createdAt: record.createdAt.toISOString(),
});

/** The signed-in user's feed, newest first. */
export const listMyNotifications = async (userId: string, query: ListNotificationsQuery) => {
  const paging = toMongoPaging(query, notificationSortFields);
  const { items, totalItems } = await repository.findUserNotifications(userId, {
    unreadOnly: query.unreadOnly,
    ...paging,
  });
  return { items: items.map(toNotificationDto), totalItems };
};

export const countMyUnreadNotifications = async (userId: string) => ({
  count: await repository.countUnread(userId),
});

export const markMyNotificationRead = async (
  userId: string,
  id: string,
): Promise<NotificationDto> => {
  const updated = await repository.markRead(userId, id);
  // Another user's notification answers 404 too, so ids cannot be probed.
  if (!updated) throw notFound('NOTIFICATION_NOT_FOUND', 'Không tìm thấy thông báo.');
  return toNotificationDto(updated);
};

export const markAllMyNotificationsRead = async (userId: string) => ({
  updatedCount: await repository.markAllRead(userId),
});

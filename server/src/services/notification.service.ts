import { badRequest, notFound } from '../utils/http-errors.js';
import { toMongoPaging } from '../utils/response.js';
import {
  notificationSocketEvents,
  type Mailer,
  type NotificationPusher,
} from '../interfaces/notification.ports.js';
import {
  mutableNotificationTypes,
  notificationTypeRules,
  notificationTypes,
  toNotificationType,
  type NotificationType,
} from '../constants/notification-types.js';
import type { NotificationMessage } from './notification.templates.js';
import * as repository from '../repositories/notification.repository.js';
import type { NotificationRecord } from '../repositories/notification.repository.js';
import {
  notificationSortFields,
  type ListNotificationsQuery,
  type NotificationDto,
  type NotificationPreferencesDto,
} from '../validations/notification.validation.js';

// SENT: handed to SMTP. LOGGED: SMTP not configured, only logged. NO_ADDRESS: the user has no
// email. FAILED: the mailer threw (logged; the in-app notification is kept). NONE: the type does
// not send an email copy.
export type EmailOutcome = 'SENT' | 'LOGGED' | 'NO_ADDRESS' | 'FAILED' | 'NONE';

export interface NotifyUserResult {
  notificationId: string;
  email: EmailOutcome;
}

export interface NotifierOptions {
  /** Defaults to the process-wide mailer (SMTP when configured, otherwise a log line). */
  mailer?: Mailer;
  /** Defaults to the process-wide Socket.IO pusher (none until the server sets it). */
  pusher?: NotificationPusher;
}

// The process-wide mailer (SMTP when configured), set by container.ts. Until then an email is only
// logged, never sent.
let defaultMailer: Mailer | undefined;

export const setNotificationMailer = (mailer: Mailer | undefined): void => {
  defaultMailer = mailer;
};

// The Socket.IO pusher, set by server.ts once the socket server is up.
let defaultPusher: NotificationPusher | undefined;

export const setNotificationPusher = (pusher: NotificationPusher | undefined): void => {
  defaultPusher = pusher;
};

const logOnlyMailer: Mailer = {
  send(message) {
    console.info(`[mail] No mailer configured; "${message.subject}" not sent.`);
    return Promise.resolve({ delivered: false });
  },
};

// Proposed shared helper: shared/utils/errors.ts.
export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const toNotificationDto = (record: NotificationRecord): NotificationDto => ({
  id: String(record._id),
  type: toNotificationType(record.type),
  title: record.title,
  body: record.body,
  link: record.link ?? null,
  isRead: record.isRead,
  createdAt: record.createdAt.toISOString(),
});

// A push that fails (socket server closing) is only logged: the feed is reloaded on reconnect.
const push = (
  pusher: NotificationPusher | undefined,
  userId: string,
  event: string,
  payload: unknown,
) => {
  if (!pusher) return;
  try {
    pusher.toUser(userId, event, payload);
  } catch (error) {
    console.error(`[notifications] Push ${event} failed: ${describeError(error)}`);
  }
};

const pushUnreadCount = async (pusher: NotificationPusher | undefined, userId: string) => {
  if (!pusher) return;
  push(pusher, userId, notificationSocketEvents.unreadCount, {
    count: await repository.countUnread(userId),
  });
};

/** Whether this user has turned the type off (only mutable types can be). */
const isMuted = async (userId: string, type: NotificationType): Promise<boolean> =>
  notificationTypeRules[type].mutable && repository.isTypeMuted(userId, type);

// In-app notification first (always), pushed to the user's open tabs, then the email for
// important events (best effort: a failed email is logged and never undoes the notification).
export const createNotifier = (options: NotifierOptions = {}) => ({
  /** null when the user does not exist or has turned this type off. */
  async notifyUser(userId: string, message: NotificationMessage): Promise<NotifyUserResult | null> {
    const address = await repository.findRecipientEmail(userId);
    if (address === undefined) {
      console.warn(`[notifications] ${message.type} skipped: user ${userId} does not exist.`);
      return null;
    }
    if (await isMuted(userId, message.type)) return null;

    const record = await repository.insertNotification({
      userId,
      type: message.type,
      title: message.title,
      body: message.body,
      ...(message.link ? { link: message.link } : {}),
    });
    const notificationId = String(record._id);
    const pusher = options.pusher ?? defaultPusher;
    if (pusher) {
      push(pusher, userId, notificationSocketEvents.created, {
        notification: toNotificationDto(record),
        unreadCount: await repository.countUnread(userId),
      });
    }

    if (!message.email) return { notificationId, email: 'NONE' };
    if (!address) return { notificationId, email: 'NO_ADDRESS' };
    try {
      const mailer = options.mailer ?? defaultMailer ?? logOnlyMailer;
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
  await pushUnreadCount(defaultPusher, userId);
  return toNotificationDto(updated);
};

export const markAllMyNotificationsRead = async (userId: string) => {
  const updatedCount = await repository.markAllRead(userId);
  if (updatedCount > 0) await pushUnreadCount(defaultPusher, userId);
  return { updatedCount };
};

const toPreferencesDto = (muted: readonly string[]): NotificationPreferencesDto => ({
  types: notificationTypes.map((type) => ({
    type,
    canMute: notificationTypeRules[type].mutable,
    muted: notificationTypeRules[type].mutable && muted.includes(type),
    email: notificationTypeRules[type].email,
  })),
});

export const getMyNotificationPreferences = async (userId: string) =>
  toPreferencesDto(await repository.findMutedTypes(userId));

/** Replaces the list of turned-off types. Important types cannot be turned off. */
export const updateMyNotificationPreferences = async (
  userId: string,
  mutedTypes: readonly NotificationType[],
) => {
  const locked = mutedTypes.filter((type) => !notificationTypeRules[type].mutable);
  if (locked.length > 0) {
    throw badRequest(
      'NOTIFICATION_TYPE_NOT_MUTABLE',
      'Không thể tắt thông báo quan trọng (đơn hàng, tiền, tài khoản, khiếu nại).',
      { types: locked },
    );
  }
  const unique = mutableNotificationTypes.filter((type) => mutedTypes.includes(type));
  return toPreferencesDto(await repository.saveMutedTypes(userId, unique));
};

import type { NotificationType } from '../constants/notification-types.js';
import { domainEvents, type NotifyRecipients } from './domain-events.js';

export interface NotifyInput {
  /** Kind of event (constants/notification-types.ts); decides the email copy and muting. */
  type: NotificationType;
  /** User ids, or 'ADMINS' for every active Admin. */
  to: NotifyRecipients;
  /** Vietnamese, short. */
  title: string;
  body: string;
  /** App path the notification opens, e.g. `/rentals/mine/${orderId}`. */
  link?: string;
  /** Force (true) or skip (false) the email copy; by default the type's rule decides. */
  email?: boolean;
  /** The user who caused the event: never notified about their own action. */
  actorId?: string;
}

/**
 * The one function every module calls to notify users or Admins (UC26): orders, payments,
 * wallet, disputes, moderation, identity, donations, chat, vouchers and the scheduler jobs.
 * Call it after the change is committed. It returns at once; the notification is saved, pushed
 * over Socket.IO and, for important types, emailed in the background, and a failure there never
 * undoes or delays the action.
 */
export const notify = (input: NotifyInput): void => {
  const { type, ...rest } = input;
  domainEvents.publish({ type: 'NOTIFY', notificationType: type, ...rest });
};

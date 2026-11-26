// Mail port of the notifications (TD-12: email is optional). The real SMTP mailer is
// integrations/email/notification-mailer.ts; container.ts hands it to the notification service.

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailSendResult {
  /** false when the message was only logged (SMTP not configured). */
  delivered: boolean;
}

export interface Mailer {
  send(message: MailMessage): Promise<MailSendResult>;
}

// Realtime port (UC26): pushes an event to every open tab of one user. sockets/socket.ts
// implements it with Socket.IO rooms; without it (tests, jobs run alone) nothing is pushed and
// the web app picks the change up when it reloads the feed.
export interface NotificationPusher {
  toUser(userId: string, event: string, payload: unknown): void;
}

/** Socket.IO events sent to the web app. */
export const notificationSocketEvents = {
  /** { notification: NotificationDto, unreadCount: number } */
  created: 'notification:new',
  /** { count: number } after a mark read / mark all read (other tabs follow). */
  unreadCount: 'notification:unread-count',
} as const;

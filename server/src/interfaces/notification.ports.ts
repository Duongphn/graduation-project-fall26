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

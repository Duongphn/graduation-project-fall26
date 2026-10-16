import nodemailer from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';

// Mail port (TD-12: email is optional). The notifications feature depends on `Mailer` only.
// Without SMTP_HOST the mail is logged (subject + masked address), never sent, so nothing fails
// because email is not configured. Proposed home: infrastructure/mail/mailer.ts, with the SMTP
// settings moved into config/env.ts.

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

/** Anything with nodemailer's sendMail: an SMTP transporter, or a fake in tests. */
export interface MailTransport {
  sendMail(options: SendMailOptions): Promise<unknown>;
}

export interface SmtpSettings {
  host: string | undefined;
  port: number;
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
  from: string;
}

const optional = (value: string | undefined): string | undefined =>
  value && value.trim() ? value.trim() : undefined;

export const readSmtpSettings = (source: NodeJS.ProcessEnv = process.env): SmtpSettings => ({
  host: optional(source.SMTP_HOST),
  port: Number(source.SMTP_PORT ?? 587) || 587,
  secure: source.SMTP_SECURE === 'true',
  user: optional(source.SMTP_USER),
  password: optional(source.SMTP_PASSWORD),
  from: optional(source.SMTP_FROM) ?? 'ToyFlow <no-reply@toyflow.vn>',
});

/** "an***@example.com": enough to recognise the address in a log without exposing it. */
export const maskEmail = (address: string): string => {
  const [local = '', domain = ''] = address.split('@');
  return domain ? `${local.slice(0, 2)}***@${domain}` : '***';
};

export const createLoggingMailer = (log: (line: string) => void = console.info): Mailer => ({
  send(message) {
    log(
      `[mail] SMTP is not configured; "${message.subject}" to ${maskEmail(message.to)} not sent.`,
    );
    return Promise.resolve({ delivered: false });
  },
});

const SMTP_TIMEOUT_MS = 10_000;

export const createTransportMailer = (transport: MailTransport, from: string): Mailer => ({
  async send({ to, subject, text, html }) {
    await transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
    return { delivered: true };
  },
});

export const createMailer = (settings: SmtpSettings = readSmtpSettings()): Mailer => {
  const { host } = settings;
  if (!host) return createLoggingMailer();
  let mailer: Mailer | undefined;
  // The SMTP connection is created on the first email.
  return {
    send(message) {
      mailer ??= createTransportMailer(
        nodemailer.createTransport({
          host,
          port: settings.port,
          secure: settings.secure,
          // A slow SMTP server must not hold the other recipients of an event for long.
          connectionTimeout: SMTP_TIMEOUT_MS,
          greetingTimeout: SMTP_TIMEOUT_MS,
          socketTimeout: SMTP_TIMEOUT_MS,
          ...(settings.user
            ? { auth: { user: settings.user, pass: settings.password ?? '' } }
            : {}),
        }),
        settings.from,
      );
      return mailer.send(message);
    },
  };
};

let defaultMailer: Mailer | undefined;

export const getDefaultMailer = (): Mailer => (defaultMailer ??= createMailer());

import type { SendMailOptions } from 'nodemailer';

// Render's free plan blocks every outgoing SMTP port, so Gmail SMTP times out there (ETIMEDOUT)
// and sign-up fails with MAIL_SEND_FAILED. With BREVO_API_KEY set, mail goes through Brevo's
// HTTPS API instead (port 443). The sender address must be a verified sender in Brevo.

export const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

interface Address {
  email: string;
  name?: string;
}

/** Reads `"Name" <a@b.c>`, `Name <a@b.c>` or `a@b.c`. */
export const parseAddress = (value: string): Address => {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  if (!match) return { email: value.trim() };
  const name = match[1]?.trim();
  return { email: match[2]!.trim(), ...(name ? { name } : {}) };
};

const asText = (value: SendMailOptions['html']): string | undefined =>
  typeof value === 'string' ? value : value === undefined ? undefined : String(value);

const asAddress = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.length ? asAddress(value[0]) : '';
  if (value && typeof value === 'object' && 'address' in value) {
    const { name, address } = value as { name?: string; address: string };
    return name ? `"${name}" <${address}>` : address;
  }
  return '';
};

const asRecipients = (value: SendMailOptions['to']): Address[] => {
  const list: unknown[] = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((item) => parseAddress(asAddress(item)));
};

export interface BrevoTransportOptions {
  apiKey: string;
  /** Used when a message has no `from`. */
  defaultFrom: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** Same `sendMail` shape as a nodemailer transporter, so the mailers can use either. */
export const createBrevoTransport = ({ apiKey, defaultFrom, timeoutMs, fetchImpl = fetch }: BrevoTransportOptions) => ({
  async sendMail(options: SendMailOptions): Promise<{ messageId?: string }> {
    const html = asText(options.html);
    const text = asText(options.text);
    const body = {
      sender: parseAddress(asAddress(options.from) || defaultFrom),
      to: asRecipients(options.to),
      subject: options.subject ?? '',
      ...(html ? { htmlContent: html } : {}),
      ...(text ? { textContent: text } : {}),
    };
    const response = await fetchImpl(BREVO_API_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Brevo send failed: HTTP ${response.status} ${detail.slice(0, 200)}`);
    }
    return (await response.json().catch(() => ({}))) as { messageId?: string };
  },
});

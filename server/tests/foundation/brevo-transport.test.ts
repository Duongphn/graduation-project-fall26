import { describe, expect, it, vi } from 'vitest';

import { BREVO_API_URL, createBrevoTransport, parseAddress } from '../../src/integrations/email/brevo-transport.js';
import { createBrevoMailer } from '../../src/integrations/email/notification-mailer.js';

const okFetch = () =>
  vi.fn(async () => new Response(JSON.stringify({ messageId: '<m1>' }), { status: 201 })) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>;

describe('Brevo HTTPS transport (Render free blocks SMTP)', () => {
  it('reads sender addresses', () => {
    expect(parseAddress('"ToyFlow Platform" <a@b.vn>')).toEqual({ name: 'ToyFlow Platform', email: 'a@b.vn' });
    expect(parseAddress('a@b.vn')).toEqual({ email: 'a@b.vn' });
  });

  it('posts the OTP mail to the Brevo API with the API key', async () => {
    const fetchImpl = okFetch();
    const transport = createBrevoTransport({ apiKey: 'k', defaultFrom: 'x@y.vn', timeoutMs: 1000, fetchImpl });
    await transport.sendMail({ from: '"ToyFlow Platform" <a@b.vn>', to: 'c@d.vn', subject: 'OTP', html: '<b>1</b>' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(BREVO_API_URL);
    expect((init.headers as Record<string, string>)['api-key']).toBe('k');
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { name: 'ToyFlow Platform', email: 'a@b.vn' },
      to: [{ email: 'c@d.vn' }],
      subject: 'OTP',
      htmlContent: '<b>1</b>',
    });
  });

  it('throws when Brevo refuses, so the user gets MAIL_SEND_FAILED', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"code":"unauthorized"}', { status: 401 })) as unknown as typeof fetch;
    const transport = createBrevoTransport({ apiKey: 'bad', defaultFrom: 'x@y.vn', timeoutMs: 1000, fetchImpl });
    await expect(transport.sendMail({ to: 'c@d.vn', subject: 's', text: 't' })).rejects.toThrow(/HTTP 401/);
  });

  it('sends notification mail through Brevo', async () => {
    const fetchImpl = okFetch();
    const mailer = createBrevoMailer('k', '"ToyFlow Platform" <a@b.vn>', fetchImpl);
    await expect(mailer.send({ to: 'c@d.vn', subject: 's', text: 't' })).resolves.toEqual({ delivered: true });
    const body = JSON.parse((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ sender: { email: 'a@b.vn' }, textContent: 't' });
  });
});

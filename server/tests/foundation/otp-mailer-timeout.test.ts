import net from 'node:net';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// R05 TC-REL-005: a blocked SMTP server must give an error before the 15 s web time-out.
let server: net.Server;
let port: number;

beforeAll(async () => {
  // Accepts the connection and never answers (like a port that is silently blocked).
  server = net.createServer(() => undefined);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  vi.unstubAllEnvs();
  server.close();
});

describe('OTP mailer time-outs (TC-REL-005)', () => {
  it('keeps every SMTP step under the 15 s client time-out', async () => {
    const { OTP_SMTP_TIMEOUT_MS } = await import('../../src/integrations/email/mailer.js');
    expect(OTP_SMTP_TIMEOUT_MS).toBeLessThan(15_000);
  });

  it('fails fast when the SMTP server does not answer', async () => {
    vi.resetModules();
    vi.stubEnv('EMAIL_HOST', '127.0.0.1');
    vi.stubEnv('EMAIL_PORT', String(port));
    const { createOtpTransport } = await import('../../src/integrations/email/mailer.js');
    const started = Date.now();
    await expect(
      createOtpTransport(300).sendMail({ from: 'a@example.com', to: 'b@example.com', subject: 's', text: 't' }),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

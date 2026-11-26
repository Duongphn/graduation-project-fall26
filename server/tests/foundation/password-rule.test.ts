import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { registerSchema, resetPasswordSchema } from '../../src/validations/auth.validation.js';

// R05 TC-SEC-005: the API enforces the password rule (8+ characters, letters and digits).
const base = { email: 'pw@example.com', fullName: 'Kiểm Thử', phone: '0912345678' };

describe('password rule on the API (TC-SEC-005)', () => {
  it.each(['abc123', 'abcdefgh', '12345678', 'abc1234'])('refuses "%s" on register and reset', (password) => {
    expect(registerSchema.safeParse({ ...base, password }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ resetToken: 't', newPassword: password }).success).toBe(false);
  });

  it.each(['abcd1234', 'Test@1234', 'Mật khẩu 2026'])('accepts "%s"', (password) => {
    expect(registerSchema.safeParse({ ...base, password }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ resetToken: 't', newPassword: password }).success).toBe(true);
  });

  it('answers 400 VALIDATION_ERROR before any code is sent', async () => {
    const mailer = { sendOtpEmail: vi.fn(async () => undefined), sendResetPasswordEmail: vi.fn(async () => undefined) };
    const app = createApp({ authMailer: mailer });
    const res = await request(app).post('/api/v1/auth/register').send({ ...base, password: 'abc123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mailer.sendOtpEmail).not.toHaveBeenCalled();
  });
});

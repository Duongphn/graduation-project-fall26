import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { OtpRequest, User } from '../src/models/index.js';
import { useTestDatabase } from './support/test-database.js';

// R05 TC-SEC-015/016: GB-02 (5-minute codes, 5 codes per hour) and 5 wrong codes cancel the code.
useTestDatabase();

const sendOtpEmail = vi.fn(async () => undefined);
const sendResetPasswordEmail = vi.fn(async () => undefined);
const app = createApp({ authMailer: { sendOtpEmail, sendResetPasswordEmail } });
const api = request(app);
const email = 'moi@example.com';
const registration = { email, fullName: 'Nguyen Van Moi', phone: '0912345670', password: 'Test@1234' };
let passwordHash: string;

// Skips the 60-second resend wait (it is not under test here).
const skipResendWait = (identifier: string, purpose: string) =>
  OtpRequest.collection.updateMany({ identifier, purpose }, { $set: { createdAt: new Date(Date.now() - 61_000) } });

beforeAll(async () => {
  passwordHash = await bcrypt.hash('Test@1234', 4);
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), OtpRequest.deleteMany({})]);
  await User.create({ email: 'an@example.com', phone: '0912345678', passwordHash, fullName: 'Nguyen Van An', role: 'USER', status: 'ACTIVE' });
  sendOtpEmail.mockClear();
  sendResetPasswordEmail.mockClear();
});

describe('OTP lifetime and hourly cap (TC-SEC-015)', () => {
  it('registration codes expire after 5 minutes', async () => {
    expect((await api.post('/api/v1/auth/register').send(registration)).status).toBe(200);
    const otp = await OtpRequest.findOne({ identifier: email, purpose: 'register' }).lean();
    expect(otp!.expires_at.getTime() - otp!.createdAt.getTime()).toBeLessThanOrEqual(5 * 60_000 + 1000);
  });

  it('refuses the 6th registration code within one hour and sends no email', async () => {
    expect((await api.post('/api/v1/auth/register').send(registration)).status).toBe(200);
    for (let i = 0; i < 4; i++) {
      await skipResendWait(email, 'register');
      expect((await api.post('/api/v1/auth/register/resend-otp').send({ email })).status).toBe(200);
    }
    await skipResendWait(email, 'register');
    const sixth = await api.post('/api/v1/auth/register/resend-otp').send({ email });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('OTP_HOURLY_LIMIT');
    expect(sendOtpEmail).toHaveBeenCalledTimes(5);
  });

  it('refuses the 6th password-reset code within one hour, with reset codes of 5 minutes', async () => {
    for (let i = 0; i < 5; i++) {
      await skipResendWait('an@example.com', 'reset_password');
      expect((await api.post('/api/v1/auth/forgot-password').send({ email: 'an@example.com' })).status).toBe(200);
    }
    await skipResendWait('an@example.com', 'reset_password');
    const sixth = await api.post('/api/v1/auth/forgot-password').send({ email: 'an@example.com' });
    expect(sixth.status).toBe(429);
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(5);
    const latest = await OtpRequest.findOne({ identifier: 'an@example.com', purpose: 'reset_password' }).sort({ expires_at: -1 }).lean();
    expect(latest!.expires_at.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
  });
});

describe('five wrong codes cancel the code (TC-SEC-016)', () => {
  it('registration: the right code no longer works after 5 wrong codes', async () => {
    await api.post('/api/v1/auth/register').send(registration);
    const otp = await OtpRequest.findOne({ identifier: email, purpose: 'register' }).lean();
    const wrong = otp!.otp_code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      expect((await api.post('/api/v1/auth/register/verify-otp').send({ email, otpCode: wrong })).status).toBe(400);
    }
    const right = await api.post('/api/v1/auth/register/verify-otp').send({ email, otpCode: otp!.otp_code });
    expect(right.status).toBe(400);
    expect(await User.exists({ email })).toBeNull();
  });

  it('four wrong codes still leave the right code usable', async () => {
    await api.post('/api/v1/auth/register').send(registration);
    const otp = await OtpRequest.findOne({ identifier: email, purpose: 'register' }).lean();
    const wrong = otp!.otp_code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await api.post('/api/v1/auth/register/verify-otp').send({ email, otpCode: wrong });
    expect((await api.post('/api/v1/auth/register/verify-otp').send({ email, otpCode: otp!.otp_code })).status).toBe(201);
  });

  it('password reset: the right code is refused after 5 wrong codes', async () => {
    await api.post('/api/v1/auth/forgot-password').send({ email: 'an@example.com' });
    const otp = await OtpRequest.findOne({ identifier: 'an@example.com', purpose: 'reset_password' }).lean();
    const wrong = otp!.otp_code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await api.post('/api/v1/auth/verify-reset-code').send({ email: 'an@example.com', otpCode: wrong });
    const right = await api.post('/api/v1/auth/verify-reset-code').send({ email: 'an@example.com', otpCode: otp!.otp_code });
    expect(right.status).toBe(400);
  });
});

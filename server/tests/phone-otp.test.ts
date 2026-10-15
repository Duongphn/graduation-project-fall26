import request from 'supertest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createApp } from '../src/app/create-app.js';
import { formatPhoneNumberE164, formatPhoneNumberForVietnam } from '../src/infrastructure/sms/sms.service.js';
import { OtpRequest } from '../src/features/otp_requests/otp_requests.model.js';
import { User } from '../src/features/users/users.model.js';

describe('Phone OTP and SMS helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats Vietnamese phone numbers correctly to E.164 and local format', () => {
    expect(formatPhoneNumberE164('0352824919')).toBe('+84352824919');
    expect(formatPhoneNumberE164('+840352824919')).toBe('+84352824919');
    expect(formatPhoneNumberE164('+84352824919')).toBe('+84352824919');
    expect(formatPhoneNumberE164('0912 345 678')).toBe('+84912345678');

    expect(formatPhoneNumberForVietnam('+84352824919')).toBe('0352824919');
    expect(formatPhoneNumberForVietnam('0352824919')).toBe('0352824919');
  });

  it('rejects invalid phone numbers when requesting OTP', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/phone/send-otp')
      .send({ phone: 'invalid-phone-123' });

    expect(res.status).toBe(400);
  });

  it('rejects missing or malformed OTP during verification', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/auth/phone/verify-otp')
      .send({ phone: '0352824919', otpCode: '123' });

    expect(res.status).toBe(400);
  });

  it('rejects sending OTP if phone has already been verified', async () => {
    const app = createApp();
    const testPhone = '0988776655';

    vi.spyOn(User, 'findOne').mockResolvedValue(null);
    vi.spyOn(OtpRequest, 'findOne').mockResolvedValue({
      identifier: testPhone,
      purpose: 'phone_verification',
      is_used: true,
    } as any);

    const res = await request(app)
      .post('/api/v1/auth/phone/send-otp')
      .send({ phone: testPhone });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PHONE_ALREADY_VERIFIED');
  });
});

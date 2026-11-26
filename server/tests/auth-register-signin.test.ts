import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { OtpRequest, RefreshToken, User } from '../src/models/index.js';
import { useTestDatabase } from './support/test-database.js';

// R03 UC01 bước 5: mã đúng → tạo tài khoản Active/Unverified và đăng nhập người dùng luôn.
useTestDatabase();

const sendOtpEmail = vi.fn(async () => undefined);
const app = createApp({ authMailer: { sendOtpEmail, sendResetPasswordEmail: vi.fn(async () => undefined) } });
const api = request(app);
const email = 'moi@example.com';

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), OtpRequest.deleteMany({}), RefreshToken.deleteMany({})]);
});

describe('đăng ký xong được đăng nhập (UC01 bước 5)', () => {
  it('trả phiên đăng nhập (user + cặp token) và token dùng được ngay', async () => {
    await api.post('/api/v1/auth/register').send({ email, fullName: 'Nguyen Van Moi', phone: '0912345670', password: 'Test@1234' });
    const otp = await OtpRequest.findOne({ identifier: email, purpose: 'register' }).lean();

    const created = await api.post('/api/v1/auth/register/verify-otp').send({ email, otpCode: otp!.otp_code });
    expect(created.status).toBe(201);
    const { user, tokens } = created.body.data;
    expect(user).toMatchObject({ email, fullName: 'Nguyen Van Moi', role: 'USER' });
    expect(typeof tokens.accessToken).toBe('string');
    expect(typeof tokens.refreshToken).toBe('string');

    const account = await User.findOne({ email }).lean();
    expect(account).toMatchObject({ status: 'ACTIVE', verificationStatus: 'unverified' });
    expect(await RefreshToken.countDocuments({ userId: account!._id })).toBe(1);

    const profile = await api.get('/api/v1/users/profile').set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.email).toBe(email);
  });
});

// E2E 26/11 #9 and #11: the API (not only the web form) checks these inputs.
describe('đăng ký qua API: email có dấu cách, SĐT có ký tự "|"', () => {
  it('chấp nhận email có dấu cách đầu/cuối và lưu dạng đã trim, chữ thường', async () => {
    const res = await api
      .post('/api/v1/auth/register')
      .send({ email: '  Space@Example.com ', fullName: 'Nguyen Van Moi', phone: '0912345671', password: 'Test@1234' });
    expect(res.status).toBeLessThan(300);
    const otp = await OtpRequest.findOne({ identifier: 'space@example.com', purpose: 'register' }).lean();
    expect(otp).not.toBeNull();

    const created = await api.post('/api/v1/auth/register/verify-otp').send({ email: ' space@example.com ', otpCode: otp!.otp_code });
    expect(created.status).toBe(201);
    expect(await User.exists({ email: 'space@example.com' })).not.toBeNull();
  });

  it('từ chối SĐT "0|11000012" với 400 VALIDATION_ERROR', async () => {
    const res = await api
      .post('/api/v1/auth/register')
      .send({ email, fullName: 'Nguyen Van Moi', phone: '0|11000012', password: 'Test@1234' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await OtpRequest.countDocuments({ identifier: email })).toBe(0);
  });
});

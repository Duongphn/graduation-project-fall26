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

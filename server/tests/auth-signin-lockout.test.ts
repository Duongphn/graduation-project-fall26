import bcrypt from 'bcryptjs';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { User } from '../src/models/index.js';
import { useTestDatabase } from './support/test-database.js';

// R05 TC-SEC-006/007: GB-03 lockout after 5 failed sign-ins, GB-04 same message, GB-05 timed lock.
useTestDatabase();

const mailer = { sendOtpEmail: vi.fn(async () => undefined), sendResetPasswordEmail: vi.fn(async () => undefined) };
const app = createApp({ authMailer: mailer });
const PASSWORD = 'Test@1234';
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

beforeEach(async () => {
  await User.deleteMany({});
  await User.create({ email: 'an@example.com', phone: '0912345678', passwordHash, fullName: 'Nguyen Van An', role: 'USER', status: 'ACTIVE' });
});

const signIn = (identifier: string, password: string) => request(app).post('/api/v1/auth/login').send({ identifier, password });

describe('sign-in lockout (TC-SEC-006)', () => {
  it('shows the attempts left, locks on the 5th failure and refuses the right password while locked', async () => {
    for (let i = 1; i <= 4; i++) {
      const res = await signIn('an@example.com', 'Wrong#123');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toContain(`còn ${5 - i} lần thử`);
    }
    const fifth = await signIn('an@example.com', 'Wrong#123');
    expect(fifth.status).toBe(403);
    expect(fifth.body.error.code).toBe('USER_LOCKED');
    expect(fifth.body.error.message).toContain('15 phút');

    const right = await signIn('an@example.com', PASSWORD);
    expect(right.status).toBe(403);
    expect(right.body.data).toBeUndefined();
  });

  it('signs in again after the 15 minutes and resets the counter', async () => {
    for (let i = 0; i < 5; i++) await signIn('an@example.com', 'Wrong#123');
    await User.updateOne({ email: 'an@example.com' }, { $set: { 'lock.until': new Date(Date.now() - 1000) } });
    const res = await signIn('an@example.com', PASSWORD);
    expect(res.status).toBe(200);
    const user = await User.findOne({ email: 'an@example.com' }).lean();
    expect(user?.failedLogins?.count).toBe(0);
    expect(user?.lock?.until).toBeUndefined();
    expect((await signIn('an@example.com', 'Wrong#123')).body.error.message).toContain('còn 4 lần thử');
  });

  it('a successful sign-in resets the count of failures', async () => {
    await signIn('an@example.com', 'Wrong#123');
    await signIn('an@example.com', 'Wrong#123');
    expect((await signIn('an@example.com', PASSWORD)).status).toBe(200);
    expect((await signIn('an@example.com', 'Wrong#123')).body.error.message).toContain('còn 4 lần thử');
  });

  it('answers an unknown account the same way as a wrong password (GB-04)', async () => {
    const unknown = await signIn('nobody@example.com', 'Wrong#123');
    const wrong = await signIn('an@example.com', 'Wrong#123');
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.error).toEqual(wrong.body.error);
  });
});

describe('timed lock (TC-SEC-007)', () => {
  it('refuses password sign-in by email and by phone while lock.until is in the future', async () => {
    await User.updateOne({ email: 'an@example.com' }, { $set: { 'lock.until': new Date(Date.now() + 15 * 60_000) } });
    for (const identifier of ['an@example.com', '0912345678']) {
      const res = await signIn(identifier, PASSWORD);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('USER_LOCKED');
      expect(res.body.data).toBeUndefined();
    }
  });
});

describe('sign-in by phone in any written form', () => {
  it('finds the account whether the phone is typed with spaces, with +84 or 84', async () => {
    for (const identifier of ['0912345678', '0912 345 678', '+84912345678', '84912345678', '+84 912 345 678']) {
      const res = await signIn(identifier, PASSWORD);
      expect(res.status, identifier).toBe(200);
      expect(res.body.data.user.email).toBe('an@example.com');
    }
  });

  it('finds an account saved as +84 when the user types 0912...', async () => {
    await User.updateOne({ email: 'an@example.com' }, { $set: { phone: '+84912345678' } });
    expect((await signIn('0912345678', PASSWORD)).status).toBe(200);
  });

  it('counts wrong passwords typed in different forms against the same account', async () => {
    await signIn('0912345678', 'Wrong#123');
    const res = await signIn('+84912345678', 'Wrong#123');
    expect(res.body.error.message).toContain('còn 3 lần thử');
  });
});

describe('registration refuses a phone already used in another form', () => {
  it('answers PHONE_EXISTS for +84912345678 when 0912345678 is taken', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'binh@example.com', password: 'Test@1234', fullName: 'Tran Binh', phone: '+84912345678' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_EXISTS');
  });
});

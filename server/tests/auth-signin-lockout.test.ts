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

describe('Admin lock (UC29) next to the failed sign-in lock (GB-03)', () => {
  const REASON = 'Đăng tin giả mạo nhiều lần, đã nhắc nhở nhưng không sửa.';
  const adminLock = (until?: Date) =>
    User.updateOne(
      { email: 'an@example.com' },
      { $set: { status: 'LOCKED', 'lock.reason': REASON, ...(until ? { 'lock.until': until } : {}) } },
    );

  it('answers a timed Admin lock with MSG12 and its reason, by email and by phone, not with the failed sign-in message', async () => {
    await adminLock(new Date(Date.now() + 7 * 24 * 60 * 60_000));
    for (const identifier of ['an@example.com', '0912 345 678']) {
      const res = await signIn(identifier, PASSWORD);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('USER_INACTIVE');
      expect(res.body.error.message).toContain(`Lý do: ${REASON}`);
      expect(res.body.error.message).not.toContain('15 phút');
      expect(res.body.data).toBeUndefined();
    }
  });

  it('never shortens an Admin lock: five wrong passwords keep the Admin lock end', async () => {
    const until = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    await adminLock(until);
    for (let i = 0; i < 5; i++) await signIn('an@example.com', 'Wrong#123');
    const user = await User.findOne({ email: 'an@example.com' }).lean();
    expect(user?.status).toBe('LOCKED');
    expect(user?.lock?.until?.getTime()).toBe(until.getTime());
    expect((await signIn('an@example.com', PASSWORD)).body.error.message).toContain(`Lý do: ${REASON}`);
  });

  it('lets a user in when the Admin lock has run out and leaves its end for the unlock job', async () => {
    const until = new Date(Date.now() - 60_000);
    await adminLock(until);
    await User.updateOne({ email: 'an@example.com' }, { $set: { 'failedLogins.count': 2 } });
    const res = await signIn('an@example.com', PASSWORD);
    expect(res.status).toBe(200);
    const user = await User.findOne({ email: 'an@example.com' }).lean();
    // lock.until is kept: removing it would turn the ended timed lock into a permanent one.
    expect(user?.lock?.until?.getTime()).toBe(until.getTime());
    expect(user?.failedLogins?.count).toBe(0);
  });

  it('a permanent Admin lock refuses the right password', async () => {
    await adminLock();
    const res = await signIn('an@example.com', PASSWORD);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(`Tài khoản của bạn đã bị khóa. Lý do: ${REASON}`);
  });
});

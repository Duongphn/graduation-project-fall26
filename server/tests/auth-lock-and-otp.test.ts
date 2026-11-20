import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OtpRequest } from '../src/models/otp-request.model.js';
import { User } from '../src/models/user.model.js';
import { AuthService } from '../src/services/auth.service.js';
import { startReplSet, stopReplSet } from './helpers/replset.js';

const sent: { to: string; code: string }[] = [];
const mailer = {
  sendOtpEmail: async (to: string, code: string) => {
    sent.push({ to, code });
  },
  sendResetPasswordEmail: async () => {},
};
const service = new AuthService(mailer);

beforeAll(startReplSet, 60_000);
afterAll(stopReplSet);
beforeEach(async () => {
  sent.length = 0;
  await Promise.all([User.deleteMany({}), OtpRequest.deleteMany({})]);
});

describe('password sign-in and a temporary lock (GB-03, GB-05)', () => {
  it('refuses the right password while lock.until is in the future', async () => {
    await User.create({
      email: 'locked@toyflow.test',
      phone: '0900000099',
      fullName: 'Bị Khoá',
      passwordHash: await bcrypt.hash('abc12345', 4),
      lock: { until: new Date(Date.now() + 15 * 60_000) },
    });

    await expect(
      service.login({ identifier: 'locked@toyflow.test', password: 'abc12345' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'USER_LOCKED' });
  });

  it('signs in again once the lock has ended', async () => {
    await User.create({
      email: 'unlocked@toyflow.test',
      phone: '0900000098',
      fullName: 'Hết Khoá',
      passwordHash: await bcrypt.hash('abc12345', 4),
      lock: { until: new Date(Date.now() - 60_000) },
    });

    const session = await service.login({ identifier: 'unlocked@toyflow.test', password: 'abc12345' });
    expect(session.tokens.accessToken).toBeTruthy();
  });
});

describe('sign-up code (UC01, R03 III.1.1.1 (13))', () => {
  const dto = { fullName: 'Người Mới', phone: '0900000097', email: 'new@toyflow.test', password: 'abc12345' };

  it('is valid for 5 minutes', async () => {
    await service.register(dto);
    const otp = await OtpRequest.findOne({ identifier: dto.email, purpose: 'register' }).lean();
    const minutes = (otp!.expires_at.getTime() - otp!.createdAt.getTime()) / 60_000;
    expect(minutes).toBeCloseTo(5, 1);
  });

  it('stops accepting the old code once a new one was sent', async () => {
    await service.register(dto);
    const oldCode = sent[0]!.code;
    await OtpRequest.collection.updateMany({ identifier: dto.email }, { $set: { createdAt: new Date(Date.now() - 61_000) } });
    await service.resendRegistrationOtp(dto.email);
    const newCode = sent[1]!.code;

    if (oldCode !== newCode) {
      await expect(service.verifyRegistrationOtp({ email: dto.email, otpCode: oldCode })).rejects.toMatchObject({ code: 'INVALID_OTP' });
    }
    await expect(service.verifyRegistrationOtp({ email: dto.email, otpCode: newCode })).resolves.toBeTruthy();
  });
});

import { describe, expect, it } from 'vitest';

import {
  forgotPasswordSchema,
  registerSchema,
  resendRegistrationOtpSchema,
  verifyRegistrationOtpSchema,
} from '../../src/validations/auth.validation.js';

// E2E 26/11 #9 and #11: phone prefix class and email trimming on sign-up.
const body = (override: Partial<{ email: string; phone: string }>) => ({
  email: 'an@toyflow.test',
  password: 'Toyflow123',
  fullName: 'Nguyen Van An',
  phone: '0901000001',
  ...override,
});

describe('registerSchema phone', () => {
  it('accepts 0 or +84 followed by 3, 5, 7, 8 or 9 and eight digits', () => {
    for (const phone of ['0312345678', '0512345678', '0712345678', '0812345678', '0912345678', '+84912345678', ' 0912345678 ']) {
      expect(registerSchema.safeParse(body({ phone })).success, phone).toBe(true);
    }
  });

  it('refuses "|" and other prefixes', () => {
    for (const phone of ['0|11000012', '+84|11000012', '0112345678', '0212345678', '0412345678', '0612345678', '091234567', '09123456789']) {
      expect(registerSchema.safeParse(body({ phone })).success, phone).toBe(false);
    }
  });
});

describe('email fields are trimmed before the format check', () => {
  it('accepts leading and trailing spaces and returns the trimmed email', () => {
    const result = registerSchema.safeParse(body({ email: '  An@Toyflow.test ' }));
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('An@Toyflow.test');
    expect(verifyRegistrationOtpSchema.safeParse({ email: ' an@toyflow.test ', otpCode: '123456' }).success).toBe(true);
    expect(resendRegistrationOtpSchema.safeParse({ email: ' an@toyflow.test' }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: 'an@toyflow.test ' }).success).toBe(true);
  });

  it('still refuses an invalid or blank email', () => {
    for (const email of ['   ', 'an toyflow.test', ' an@ toyflow.test ']) {
      expect(registerSchema.safeParse(body({ email })).success, email).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';

import {
  registerSchema,
  loginSchema,
  verifyRegistrationOtpSchema,
  verifyGoogleOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
  logoutSchema,
  googleLoginSchema,
  googleExchangeSchema,
  resendGoogleOtpSchema,
  resendRegistrationOtpSchema,
  devTestLoginSchema,
  verifyResetCodeSchema,
} from '../../../src/validations/auth.validation.js';

// ──────────────────────────────────────────────
// registerSchema
// ──────────────────────────────────────────────
describe('registerSchema', () => {
  const validInput = {
    email: 'user@example.com',
    password: 'Abc123',
    fullName: 'Nguyễn Văn A',
    phone: '0912345678',
  };

  // ── Happy path ──
  it('accepts valid registration data', () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts phone starting with +84', () => {
    const result = registerSchema.safeParse({ ...validInput, phone: '+84912345678' });
    expect(result.success).toBe(true);
  });

  it('accepts phone starting with 03, 05, 07, 08, 09', () => {
    for (const prefix of ['03', '05', '07', '08', '09']) {
      const result = registerSchema.safeParse({ ...validInput, phone: `${prefix}12345678` });
      expect(result.success, `phone starting with ${prefix}`).toBe(true);
    }
  });

  // ── Email validation ──
  it('rejects missing email', () => {
    const { email: _, ...noEmail } = validInput;
    const result = registerSchema.safeParse(noEmail);
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = registerSchema.safeParse({ ...validInput, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects empty email string', () => {
    const result = registerSchema.safeParse({ ...validInput, email: '' });
    expect(result.success).toBe(false);
  });

  // ── Password validation ──
  it('rejects password shorter than 6 characters', () => {
    const result = registerSchema.safeParse({ ...validInput, password: '12345' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('Mật khẩu phải có ít nhất 6 ký tự');
    }
  });

  it('accepts password with exactly 6 characters (boundary)', () => {
    const result = registerSchema.safeParse({ ...validInput, password: '123456' });
    expect(result.success).toBe(true);
  });

  // ── Full name validation ──
  it('rejects fullName shorter than 2 characters', () => {
    const result = registerSchema.safeParse({ ...validInput, fullName: 'A' });
    expect(result.success).toBe(false);
  });

  it('accepts fullName with exactly 2 characters (boundary)', () => {
    const result = registerSchema.safeParse({ ...validInput, fullName: 'AB' });
    expect(result.success).toBe(true);
  });

  it('rejects fullName longer than 100 characters', () => {
    const result = registerSchema.safeParse({ ...validInput, fullName: 'A'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts fullName with exactly 100 characters (boundary)', () => {
    const result = registerSchema.safeParse({ ...validInput, fullName: 'A'.repeat(100) });
    expect(result.success).toBe(true);
  });

  // ── Phone validation ──
  it('rejects phone with wrong format', () => {
    const result = registerSchema.safeParse({ ...validInput, phone: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects phone starting with 01 (not a valid mobile prefix)', () => {
    const result = registerSchema.safeParse({ ...validInput, phone: '0112345678' });
    expect(result.success).toBe(false);
  });

  it('rejects phone with too few digits', () => {
    const result = registerSchema.safeParse({ ...validInput, phone: '091234567' });
    expect(result.success).toBe(false);
  });

  it('rejects phone with too many digits', () => {
    const result = registerSchema.safeParse({ ...validInput, phone: '09123456789' });
    expect(result.success).toBe(false);
  });

  it('rejects phone with letters', () => {
    const result = registerSchema.safeParse({ ...validInput, phone: '091234abcd' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// loginSchema
// ──────────────────────────────────────────────
describe('loginSchema', () => {
  it('accepts valid login input with email', () => {
    const result = loginSchema.safeParse({ identifier: 'user@example.com', password: 'any-password' });
    expect(result.success).toBe(true);
  });

  it('accepts valid login input with phone', () => {
    const result = loginSchema.safeParse({ identifier: '0912345678', password: 'abc123' });
    expect(result.success).toBe(true);
  });

  it('trims whitespace from identifier', () => {
    const result = loginSchema.safeParse({ identifier: '  user@example.com  ', password: 'abc' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.identifier).toBe('user@example.com');
    }
  });

  it('rejects empty identifier (after trim)', () => {
    const result = loginSchema.safeParse({ identifier: '   ', password: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ identifier: 'user@example.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing identifier field', () => {
    const result = loginSchema.safeParse({ password: 'abc123' });
    expect(result.success).toBe(false);
  });

  it('rejects missing password field', () => {
    const result = loginSchema.safeParse({ identifier: 'user@example.com' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// verifyRegistrationOtpSchema
// ──────────────────────────────────────────────
describe('verifyRegistrationOtpSchema', () => {
  it('accepts valid 6-digit OTP', () => {
    const result = verifyRegistrationOtpSchema.safeParse({ email: 'a@b.com', otpCode: '123456' });
    expect(result.success).toBe(true);
  });

  it('rejects OTP shorter than 6 digits', () => {
    const result = verifyRegistrationOtpSchema.safeParse({ email: 'a@b.com', otpCode: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects OTP longer than 6 digits', () => {
    const result = verifyRegistrationOtpSchema.safeParse({ email: 'a@b.com', otpCode: '1234567' });
    expect(result.success).toBe(false);
  });

  it('rejects OTP with non-digit characters', () => {
    const result = verifyRegistrationOtpSchema.safeParse({ email: 'a@b.com', otpCode: '12345a' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = verifyRegistrationOtpSchema.safeParse({ email: 'invalid', otpCode: '123456' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// verifyGoogleOtpSchema
// ──────────────────────────────────────────────
describe('verifyGoogleOtpSchema', () => {
  it('accepts valid tempToken and OTP', () => {
    const result = verifyGoogleOtpSchema.safeParse({ tempToken: 'tok123', otpCode: '654321' });
    expect(result.success).toBe(true);
  });

  it('rejects empty tempToken', () => {
    const result = verifyGoogleOtpSchema.safeParse({ tempToken: '', otpCode: '654321' });
    expect(result.success).toBe(false);
  });

  it('rejects OTP with letters', () => {
    const result = verifyGoogleOtpSchema.safeParse({ tempToken: 'tok123', otpCode: 'abcdef' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// forgotPasswordSchema
// ──────────────────────────────────────────────
describe('forgotPasswordSchema', () => {
  it('accepts valid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'not-email' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// verifyResetCodeSchema
// ──────────────────────────────────────────────
describe('verifyResetCodeSchema', () => {
  it('accepts valid email and 6-digit OTP', () => {
    const result = verifyResetCodeSchema.safeParse({ email: 'a@b.com', otpCode: '123456' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = verifyResetCodeSchema.safeParse({ email: 'bad', otpCode: '123456' });
    expect(result.success).toBe(false);
  });

  it('rejects OTP with wrong length', () => {
    const result = verifyResetCodeSchema.safeParse({ email: 'a@b.com', otpCode: '12345' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// resetPasswordSchema
// ──────────────────────────────────────────────
describe('resetPasswordSchema', () => {
  it('accepts valid reset data', () => {
    const result = resetPasswordSchema.safeParse({ resetToken: 'some-token', newPassword: 'NewPass123' });
    expect(result.success).toBe(true);
  });

  it('rejects empty resetToken', () => {
    const result = resetPasswordSchema.safeParse({ resetToken: '', newPassword: 'NewPass123' });
    expect(result.success).toBe(false);
  });

  it('rejects newPassword shorter than 6 characters', () => {
    const result = resetPasswordSchema.safeParse({ resetToken: 'tok', newPassword: '12345' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// refreshTokenSchema
// ──────────────────────────────────────────────
describe('refreshTokenSchema', () => {
  it('accepts valid refresh token', () => {
    const result = refreshTokenSchema.safeParse({ refreshToken: 'some-refresh-token' });
    expect(result.success).toBe(true);
  });

  it('rejects empty refresh token', () => {
    const result = refreshTokenSchema.safeParse({ refreshToken: '' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// logoutSchema
// ──────────────────────────────────────────────
describe('logoutSchema', () => {
  it('accepts valid logout with refreshToken only', () => {
    const result = logoutSchema.safeParse({ refreshToken: 'tok' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allDevices).toBe(false); // default value
    }
  });

  it('accepts logout with allDevices = true', () => {
    const result = logoutSchema.safeParse({ refreshToken: 'tok', allDevices: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allDevices).toBe(true);
    }
  });

  it('rejects empty refreshToken', () => {
    const result = logoutSchema.safeParse({ refreshToken: '' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// googleLoginSchema
// ──────────────────────────────────────────────
describe('googleLoginSchema', () => {
  it('accepts valid idToken', () => {
    const result = googleLoginSchema.safeParse({ idToken: 'google-id-token-value' });
    expect(result.success).toBe(true);
  });

  it('rejects empty idToken', () => {
    const result = googleLoginSchema.safeParse({ idToken: '' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// googleExchangeSchema
// ──────────────────────────────────────────────
describe('googleExchangeSchema', () => {
  it('accepts valid code', () => {
    const result = googleExchangeSchema.safeParse({ code: 'auth-code-from-google' });
    expect(result.success).toBe(true);
  });

  it('rejects empty code', () => {
    const result = googleExchangeSchema.safeParse({ code: '' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// resendGoogleOtpSchema
// ──────────────────────────────────────────────
describe('resendGoogleOtpSchema', () => {
  it('accepts valid tempToken', () => {
    const result = resendGoogleOtpSchema.safeParse({ tempToken: 'tok123' });
    expect(result.success).toBe(true);
  });

  it('rejects empty tempToken', () => {
    const result = resendGoogleOtpSchema.safeParse({ tempToken: '' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// resendRegistrationOtpSchema
// ──────────────────────────────────────────────
describe('resendRegistrationOtpSchema', () => {
  it('accepts valid email', () => {
    const result = resendRegistrationOtpSchema.safeParse({ email: 'user@test.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = resendRegistrationOtpSchema.safeParse({ email: 'bad-email' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// devTestLoginSchema
// ──────────────────────────────────────────────
describe('devTestLoginSchema', () => {
  it('accepts valid email', () => {
    const result = devTestLoginSchema.safeParse({ email: 'dev@test.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = devTestLoginSchema.safeParse({ email: 'nope' });
    expect(result.success).toBe(false);
  });
});

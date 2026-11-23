import { describe, expect, it } from 'vitest';
import {
  FULL_NAME_PATTERN,
  PASSWORD_MIN_LENGTH,
  loginSchema,
  registerSchema,
  verifyRegistrationOtpSchema,
} from '../../../src/features/auth/auth.validation.js';

/**
 * UNIT TEST DOCUMENT - TC_Auth_Validation
 * Document Code: TFP_UT_v1.5
 * Module: TC_Auth_Validation (Authentication Validation)
 * Target: Zod schemas in auth.validation.ts (registerSchema, loginSchema, verifyRegistrationOtpSchema)
 * Total Cases: 21 (Normal: 7, Abnormal: 12, Boundary: 2)
 */

describe('TC_Auth_Validation - Authentication Validation', () => {
  const validRegisterData = {
    email: 'user@toyflow.com',
    password: 'Toyflow123',
    fullName: 'Nguyen Van A',
    phone: '0912345678',
  };

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: registerSchema - Registration Data Rules
  // ══════════════════════════════════════════════════════════════════════════
  describe('registerSchema - registration data rules', () => {
    // ── Normal Cases ──

    it('UTC-AVL-001 [Normal]: Chấp nhận dữ liệu đăng ký hợp lệ và tự động trim khoảng trắng thừa ở họ tên', () => {
      // 1) Dữ liệu chuẩn
      const res1 = registerSchema.safeParse(validRegisterData);
      expect(res1.success).toBe(true);
      if (res1.success) {
        expect(res1.data.email).toBe('user@toyflow.com');
        expect(res1.data.fullName).toBe('Nguyen Van A');
      }

      // 2) Họ tên có khoảng trắng ở đầu và cuối: "  Nguyễn Văn An  "
      const res2 = registerSchema.safeParse({
        ...validRegisterData,
        fullName: '  Nguyễn Văn An  ',
      });
      expect(res2.success).toBe(true);
      if (res2.success) {
        expect(res2.data.fullName).toBe('Nguyễn Văn An');
      }
    });

    it('UTC-AVL-002 [Normal]: Chấp nhận số điện thoại bắt đầu bằng đầu số quốc tế +84', () => {
      const res = registerSchema.safeParse({
        ...validRegisterData,
        phone: '+84912345678',
      });
      expect(res.success).toBe(true);
    });

    it('UTC-AVL-003 [Normal]: Chấp nhận tất cả các đầu số di động hợp lệ tại Việt Nam (03, 05, 07, 08, 09)', () => {
      const prefixes = ['03', '05', '07', '08', '09'];
      for (const prefix of prefixes) {
        const res = registerSchema.safeParse({
          ...validRegisterData,
          phone: `${prefix}12345678`,
        });
        expect(res.success, `Đầu số ${prefix} phải hợp lệ`).toBe(true);
      }
    });

    it('UTC-AVL-004 [Normal]: Chấp nhận mật khẩu chứa ký tự đặc biệt kết hợp chữ cái và số', () => {
      const res = registerSchema.safeParse({
        ...validRegisterData,
        password: 'Toyflow@2026!',
      });
      expect(res.success).toBe(true);
    });

    // ── Abnormal Cases (Email) ──

    it('UTC-AVL-005 [Abnormal]: Từ chối email không đúng định dạng tiêu chuẩn', () => {
      const invalidEmails = ['not-an-email', 'user@', '@toyflow.com', 'user@toyflow', 'user.com'];
      for (const email of invalidEmails) {
        const res = registerSchema.safeParse({ ...validRegisterData, email });
        expect(res.success, `Email ${email} phải bị từ chối`).toBe(false);
        if (!res.success) {
          const emailIssue = res.error.issues.find((i) => i.path.includes('email'));
          expect(emailIssue).toBeDefined();
        }
      }
    });

    it('UTC-AVL-006 [Abnormal]: Từ chối khi thiếu email hoặc email là chuỗi rỗng', () => {
      const resEmpty = registerSchema.safeParse({ ...validRegisterData, email: '' });
      expect(resEmpty.success).toBe(false);

      const { email: _, ...missingEmail } = validRegisterData;
      const resMissing = registerSchema.safeParse(missingEmail);
      expect(resMissing.success).toBe(false);
    });

    // ── Abnormal Cases (Password) ──

    it('UTC-AVL-007 [Abnormal]: Từ chối mật khẩu ngắn hơn 8 ký tự', () => {
      const shortPasswords = ['123', 'Toy123', 'abc1234'];
      for (const password of shortPasswords) {
        const res = registerSchema.safeParse({ ...validRegisterData, password });
        expect(res.success, `Mật khẩu ${password} phải bị từ chối do < 8 ký tự`).toBe(false);
        if (!res.success) {
          const passIssue = res.error.issues.find((i) => i.path.includes('password'));
          expect(passIssue?.message).toContain('ít nhất 8 ký tự');
        }
      }
    });

    it('UTC-AVL-008 [Abnormal]: Từ chối mật khẩu không chứa chữ số nào (chỉ toàn chữ cái)', () => {
      const res = registerSchema.safeParse({
        ...validRegisterData,
        password: 'ToyflowPassword',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const passIssue = res.error.issues.find((i) => i.path.includes('password'));
        expect(passIssue?.message).toContain('ít nhất một chữ số');
      }
    });

    it('UTC-AVL-009 [Abnormal]: Từ chối mật khẩu không chứa chữ cái nào (chỉ toàn số)', () => {
      const res = registerSchema.safeParse({
        ...validRegisterData,
        password: '1234567890',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const passIssue = res.error.issues.find((i) => i.path.includes('password'));
        expect(passIssue?.message).toContain('ít nhất một chữ cái');
      }
    });

    // ── Boundary Case (Password) ──

    it('UTC-AVL-010 [Boundary]: Chấp nhận mật khẩu đạt đúng ngưỡng biên tối thiểu 8 ký tự (có chữ và số)', () => {
      expect(PASSWORD_MIN_LENGTH).toBe(8);
      const res = registerSchema.safeParse({
        ...validRegisterData,
        password: 'Toy12345', // đúng 8 ký tự
      });
      expect(res.success).toBe(true);
    });

    // ── Abnormal & Boundary Cases (Full Name) ──

    it('UTC-AVL-011 [Abnormal]: Từ chối họ tên ngắn hơn 2 ký tự hoặc để trống', () => {
      const resSingle = registerSchema.safeParse({ ...validRegisterData, fullName: 'A' });
      expect(resSingle.success).toBe(false);

      const resEmpty = registerSchema.safeParse({ ...validRegisterData, fullName: '' });
      expect(resEmpty.success).toBe(false);
    });

    it('UTC-AVL-012 [Boundary]: Chấp nhận họ tên tại giá trị biên nhỏ nhất (2 ký tự) và biên lớn nhất (50 ký tự)', () => {
      // Biên dưới: 2 ký tự chữ cái
      const resMin = registerSchema.safeParse({ ...validRegisterData, fullName: 'An' });
      expect(resMin.success).toBe(true);

      // Biên trên: đúng 50 ký tự
      const name50 = 'A'.repeat(50);
      const resMax = registerSchema.safeParse({ ...validRegisterData, fullName: name50 });
      expect(resMax.success).toBe(true);
    });

    it('UTC-AVL-013 [Abnormal]: Từ chối họ tên vượt quá ngưỡng biên tối đa 50 ký tự (51 ký tự)', () => {
      const name51 = 'A'.repeat(51);
      const res = registerSchema.safeParse({ ...validRegisterData, fullName: name51 });
      expect(res.success).toBe(false);
    });

    it('UTC-AVL-014 [Abnormal]: Từ chối họ tên chứa chữ số hoặc ký tự đặc biệt', () => {
      const invalidNames = ['Nguyen Van 123', 'ToyFlow@User', 'Tran_Van_B', 'Lê 123 Nam'];
      for (const fullName of invalidNames) {
        const res = registerSchema.safeParse({ ...validRegisterData, fullName });
        expect(res.success, `Họ tên ${fullName} phải bị từ chối`).toBe(false);
      }
    });

    it('UTC-AVL-015 [Abnormal]: Từ chối số điện thoại không hợp lệ (sai đầu số, thừa/thiếu chữ số)', () => {
      const invalidPhones = [
        '0123456789', // Đầu số 01 cũ của bàn/đã đổi
        '0212345678', // Đầu số cố định
        '091234567',  // Thiếu số (9 số)
        '091234567890', // Thừa số (12 số)
        'abcdefghij',  // Chứa chữ cái
      ];
      for (const phone of invalidPhones) {
        const res = registerSchema.safeParse({ ...validRegisterData, phone });
        expect(res.success, `Số điện thoại ${phone} phải bị từ chối`).toBe(false);
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: loginSchema - Sign-in Rules
  // ══════════════════════════════════════════════════════════════════════════
  describe('loginSchema - sign-in rules', () => {
    it('UTC-AVL-016 [Normal]: Đăng nhập hợp lệ bằng định danh Email', () => {
      const res = loginSchema.safeParse({
        identifier: 'user@toyflow.com',
        password: 'ToyflowPassword123',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.identifier).toBe('user@toyflow.com');
      }
    });

    it('UTC-AVL-017 [Normal]: Đăng nhập hợp lệ bằng định danh Số điện thoại và tự động trim khoảng trắng', () => {
      const res = loginSchema.safeParse({
        identifier: '  0912345678  ',
        password: 'ToyflowPassword123',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.identifier).toBe('0912345678');
      }
    });

    it('UTC-AVL-018 [Abnormal]: Từ chối đăng nhập khi để trống trường định danh (identifier)', () => {
      const resEmpty = loginSchema.safeParse({
        identifier: '',
        password: 'ToyflowPassword123',
      });
      expect(resEmpty.success).toBe(false);

      const resWhitespace = loginSchema.safeParse({
        identifier: '     ',
        password: 'ToyflowPassword123',
      });
      expect(resWhitespace.success).toBe(false);
    });

    it('UTC-AVL-019 [Abnormal]: Từ chối đăng nhập khi để trống mật khẩu (password)', () => {
      const res = loginSchema.safeParse({
        identifier: 'user@toyflow.com',
        password: '',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const passIssue = res.error.issues.find((i) => i.path.includes('password'));
        expect(passIssue?.message).toContain('Vui lòng nhập mật khẩu');
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3: verifyRegistrationOtpSchema - Registration OTP Rules
  // ══════════════════════════════════════════════════════════════════════════
  describe('verifyRegistrationOtpSchema - registration OTP rules', () => {
    it('UTC-AVL-020 [Normal]: Xác thực OTP đăng ký hợp lệ với mã OTP chuẩn 6 chữ số và email hợp lệ', () => {
      const res = verifyRegistrationOtpSchema.safeParse({
        email: 'user@toyflow.com',
        otpCode: '123456',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.otpCode).toBe('123456');
        expect(res.data.email).toBe('user@toyflow.com');
      }
    });

    it('UTC-AVL-021 [Abnormal]: Từ chối mã OTP không đủ hoặc vượt quá 6 chữ số, hoặc chứa ký tự không phải số', () => {
      const invalidOtps = [
        '12345',    // 5 ký tự (< 6)
        '1234567',  // 7 ký tự (> 6)
        '12345A',   // Chứa chữ cái
        'ABCDEF',   // Toàn chữ cái
        '',         // Rỗng
      ];
      for (const otpCode of invalidOtps) {
        const res = verifyRegistrationOtpSchema.safeParse({
          email: 'user@toyflow.com',
          otpCode,
        });
        expect(res.success, `Mã OTP "${otpCode}" phải bị từ chối`).toBe(false);
      }
    });
  });
});

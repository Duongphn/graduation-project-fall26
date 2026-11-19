import { describe, expect, it } from 'vitest';

import { registerSchema } from '../../src/validations/auth.validation.js';

// R03 III.1.1.1 (5): the full name on sign-up has 2 to 50 letters and spaces.
const body = (fullName: string) => ({
  email: 'an@toyflow.test',
  password: 'Toyflow123',
  fullName,
  phone: '0901000001',
});

describe('registerSchema fullName', () => {
  it('accepts Vietnamese letters and spaces, 2 to 50 characters', () => {
    expect(registerSchema.safeParse(body('Nguyễn Văn An')).success).toBe(true);
    expect(registerSchema.safeParse(body('A'.repeat(50))).success).toBe(true);
  });

  it('refuses digits, a single letter and more than 50 characters', () => {
    for (const name of ['Nguyen Van 123', 'A', 'A'.repeat(51)]) {
      expect(registerSchema.safeParse(body(name)).success).toBe(false);
    }
  });
});

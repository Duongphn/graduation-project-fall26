import { describe, expect, it } from 'vitest';

import {
  findSettingDefinition,
  type SettingDefinition,
  SETTING_KEYS,
  SYSTEM_SETTINGS,
} from '../src/constants/system-settings.js';
import {
  formatSettingValue,
  parseSettingInput,
  readStoredValue,
  toEffectiveValue,
  toStoredText,
} from '../src/services/system-setting.rules.js';

const def = (key: string): SettingDefinition => findSettingDefinition(key)!;
const rentalFee = def(SETTING_KEYS.rentalPlatformFeeRate);
const lateFee = def(SETTING_KEYS.rentalLateFeeMultiplier);
const paymentHours = def(SETTING_KEYS.rentalPaymentHours);
const minWithdrawal = def(SETTING_KEYS.withdrawalMinAmount);
const trustScore = def(SETTING_KEYS.trustMinScore);
const decisionDays = def(SETTING_KEYS.donationDecisionDays);

const ok = (value: number) => ({ ok: true, value });
const fail = (message: string) => ({ ok: false, message });

describe('System setting catalogue (UC30)', () => {
  it('has unique keys, five groups and defaults inside their own range', () => {
    expect(new Set(SYSTEM_SETTINGS.map((s) => s.key)).size).toBe(SYSTEM_SETTINGS.length);
    expect(new Set(SYSTEM_SETTINGS.map((s) => s.group))).toEqual(
      new Set(['RENTAL', 'PURCHASE', 'WALLET', 'TRUST', 'DONATION']),
    );
    for (const setting of SYSTEM_SETTINGS) {
      expect(parseSettingInput(setting, setting.defaultValue)).toEqual(ok(setting.defaultValue));
    }
  });

  it('keeps the R03 2.6.2 defaults: 10% rental fee, 5% commission, 50 points, 14 days', () => {
    expect(rentalFee.defaultValue).toBe(10);
    expect(def(SETTING_KEYS.purchaseCommissionRate).defaultValue).toBe(5);
    expect(trustScore.defaultValue).toBe(50);
    expect(decisionDays.defaultValue).toBe(14);
    expect(paymentHours.defaultValue).toBe(12);
    expect(lateFee.defaultValue).toBe(1);
  });
});

describe('parseSettingInput', () => {
  it('accepts numbers and texts with spaces, a decimal comma or a decimal dot', () => {
    expect(parseSettingInput(rentalFee, 12)).toEqual(ok(12));
    expect(parseSettingInput(rentalFee, ' 12 ')).toEqual(ok(12));
    expect(parseSettingInput(rentalFee, '12,5')).toEqual(ok(12.5));
    expect(parseSettingInput(rentalFee, '12.5')).toEqual(ok(12.5));
    expect(parseSettingInput(rentalFee, '7,25')).toEqual(ok(7.25));
    expect(parseSettingInput(lateFee, '1,5')).toEqual(ok(1.5));
  });

  it('accepts thousand separators only for whole numbers', () => {
    expect(parseSettingInput(minWithdrawal, '100.000')).toEqual(ok(100_000));
    expect(parseSettingInput(minWithdrawal, '100,000')).toEqual(ok(100_000));
    expect(parseSettingInput(minWithdrawal, '1 000 000')).toEqual(ok(1_000_000));
    expect(parseSettingInput(minWithdrawal, '1.000,000')).toEqual(fail('Giá trị phải là một số.'));
  });

  it('refuses empty, non-numbers and other types', () => {
    expect(parseSettingInput(paymentHours, '')).toEqual(fail('Vui lòng nhập giá trị.'));
    expect(parseSettingInput(paymentHours, '   ')).toEqual(fail('Vui lòng nhập giá trị.'));
    expect(parseSettingInput(paymentHours, null)).toEqual(fail('Vui lòng nhập giá trị.'));
    expect(parseSettingInput(paymentHours, 'mười hai')).toEqual(fail('Giá trị phải là một số.'));
    expect(parseSettingInput(paymentHours, '12h')).toEqual(fail('Giá trị phải là một số.'));
    expect(parseSettingInput(paymentHours, '1e2')).toEqual(fail('Giá trị phải là một số.'));
    expect(parseSettingInput(paymentHours, true)).toEqual(fail('Giá trị phải là một số.'));
    expect(parseSettingInput(paymentHours, Number.NaN)).toEqual(fail('Giá trị phải là một số.'));
    expect(parseSettingInput(rentalFee, '12%')).toEqual(fail('Giá trị phải là một số.'));
  });

  it('wants whole numbers for days, VND and points', () => {
    expect(parseSettingInput(decisionDays, '7.5')).toEqual(fail('Giá trị phải là số nguyên.'));
    expect(parseSettingInput(trustScore, 49.9)).toEqual(fail('Giá trị phải là số nguyên.'));
  });

  // Staging shortens time limits to minutes (R5.0 II.1): hours take up to 2 decimals from 0.01.
  it('takes hours with up to two decimals, from 0.01 hour', () => {
    expect(parseSettingInput(paymentHours, 1.5)).toEqual(ok(1.5));
    expect(parseSettingInput(paymentHours, ' 0,1 ')).toEqual(ok(0.1));
    expect(parseSettingInput(paymentHours, '0.04')).toEqual(ok(0.04));
    expect(parseSettingInput(paymentHours, 0.01)).toEqual(ok(0.01));
    expect(parseSettingInput(paymentHours, '0,005')).toEqual(
      fail('Chỉ nhập tối đa 2 chữ số thập phân.'),
    );
  });

  it('allows at most two decimals for rates and the multiplier', () => {
    expect(parseSettingInput(rentalFee, 12.345)).toEqual(
      fail('Chỉ nhập tối đa 2 chữ số thập phân.'),
    );
    expect(parseSettingInput(lateFee, '1,255')).toEqual(
      fail('Chỉ nhập tối đa 2 chữ số thập phân.'),
    );
  });

  it('checks the range, one step past each end', () => {
    expect(parseSettingInput(rentalFee, 0)).toEqual(ok(0));
    expect(parseSettingInput(rentalFee, 50)).toEqual(ok(50));
    expect(parseSettingInput(rentalFee, 50.01)).toEqual(fail('Giá trị phải từ 0% đến 50%.'));
    expect(parseSettingInput(rentalFee, '-1')).toEqual(fail('Giá trị phải từ 0% đến 50%.'));
    expect(parseSettingInput(paymentHours, 0)).toEqual(
      fail('Giá trị phải từ 0,01 giờ đến 168 giờ.'),
    );
    expect(parseSettingInput(paymentHours, 168.01)).toEqual(
      fail('Giá trị phải từ 0,01 giờ đến 168 giờ.'),
    );
    expect(parseSettingInput(paymentHours, 169)).toEqual(
      fail('Giá trị phải từ 0,01 giờ đến 168 giờ.'),
    );
    expect(parseSettingInput(paymentHours, 168)).toEqual(ok(168));
    expect(parseSettingInput(trustScore, 101)).toEqual(
      fail('Giá trị phải từ 0 điểm đến 100 điểm.'),
    );
    expect(parseSettingInput(decisionDays, '91')).toEqual(
      fail('Giá trị phải từ 1 ngày đến 90 ngày.'),
    );
    expect(parseSettingInput(minWithdrawal, 999)).toEqual(
      fail('Giá trị phải từ 1.000 VND đến 100.000.000 VND.'),
    );
  });
});

describe('stored values', () => {
  it('stores rates as a fraction and reads them back in percent', () => {
    expect(toStoredText(rentalFee, 12.5)).toBe('0.125');
    expect(toStoredText(rentalFee, 7)).toBe('0.07');
    expect(toEffectiveValue(rentalFee, 7.25)).toBe(0.0725);
    expect(readStoredValue(rentalFee, '0.07')).toBe(7);
    expect(readStoredValue(rentalFee, ' 0.125 ')).toBe(12.5);
    expect(toStoredText(paymentHours, 6)).toBe('6');
  });

  it('ignores missing, non-number, out-of-range and fractional whole-number values', () => {
    expect(readStoredValue(paymentHours, undefined)).toBeUndefined();
    expect(readStoredValue(paymentHours, '')).toBeUndefined();
    expect(readStoredValue(paymentHours, 'abc')).toBeUndefined();
    expect(readStoredValue(paymentHours, '0')).toBeUndefined();
    expect(readStoredValue(paymentHours, '1.5')).toBe(1.5);
    // the staging shortcut of R5.0 II.1 keeps working; below 0.01 hour falls back to the default
    expect(readStoredValue(paymentHours, '0.04')).toBe(0.04);
    expect(readStoredValue(paymentHours, '0.004')).toBeUndefined();
    expect(readStoredValue(rentalFee, '0.6')).toBeUndefined();
    expect(readStoredValue(rentalFee, '-0.1')).toBeUndefined();
    expect(readStoredValue(decisionDays, '7.5')).toBeUndefined();
    expect(readStoredValue(decisionDays, '7')).toBe(7);
  });

  it('formats values with their Vietnamese unit', () => {
    expect(formatSettingValue(rentalFee, 12.5)).toBe('12,5%');
    expect(formatSettingValue(paymentHours, 24)).toBe('24 giờ');
    expect(formatSettingValue(minWithdrawal, 500_000)).toBe('500.000 VND');
    expect(formatSettingValue(trustScore, 50)).toBe('50 điểm');
    expect(formatSettingValue(decisionDays, 14)).toBe('14 ngày');
    expect(formatSettingValue(lateFee, 1.5)).toBe('1,5 lần');
  });
});

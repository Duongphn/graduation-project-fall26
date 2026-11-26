import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PURCHASE_TIMINGS } from '../src/constants/order-timing.js';
import { SystemSetting } from '../src/models/system-setting.model.js';
import { SystemSettingService } from '../src/services/system-setting.service.js';
import { DEFAULT_RENTAL_SETTINGS } from '../src/types/rental-order.types.js';
import { DEFAULT_DONATION_SETTINGS } from '../src/constants/donation-request-transitions.js';
import {
  DEFAULT_PURCHASE_SETTINGS,
  DEFAULT_WITHDRAWAL_LIMITS,
} from '../src/constants/system-settings.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('SystemSettingService', () => {
  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('returns defaults when nothing is stored', async () => {
    expect(await new SystemSettingService().getRentalSettings()).toEqual(DEFAULT_RENTAL_SETTINGS);
  });

  it('reads stored overrides and ignores invalid values', async () => {
    await SystemSetting.create([
      { key: 'rental.paymentHours', value: '6' },
      { key: 'rental.platformFeeRate', value: '0.15' },
      { key: 'rental.maxDays', value: 'abc' },
    ]);
    const s = await new SystemSettingService().getRentalSettings();
    expect(s.paymentHours).toBe(6);
    expect(s.platformFeeRate).toBe(0.15);
    expect(s.maxDays).toBe(30);
  });

  it('defaults cancelFeeRate to 0.2', async () => {
    expect((await new SystemSettingService().getRentalSettings()).cancelFeeRate).toBe(0.2);
  });

  it('falls back to the default for a cancelFeeRate above 1 or below 0', async () => {
    await SystemSetting.create([{ key: 'rental.cancelFeeRate', value: '1.5' }]);
    expect((await new SystemSettingService().getRentalSettings()).cancelFeeRate).toBe(0.2);
    await SystemSetting.updateOne({ key: 'rental.cancelFeeRate' }, { value: '-1' });
    expect((await new SystemSettingService().getRentalSettings()).cancelFeeRate).toBe(0.2);
  });

  it('getNumbers reads any prefix with defaults', async () => {
    await SystemSetting.create([{ key: 'purchase.sellerResponseHours', value: '6' }]);
    const t = await new SystemSettingService().getNumbers('purchase', DEFAULT_PURCHASE_TIMINGS);
    expect(t).toEqual({ sellerResponseHours: 6, buyerAutoCompleteHours: 72 });
  });

  it('reads the GB-57 donation time limits, 14 days by default (UC30)', async () => {
    expect(await new SystemSettingService().getDonationSettings()).toEqual(
      DEFAULT_DONATION_SETTINGS,
    );
    await SystemSetting.create([
      { key: 'DONATION_DECISION_DAYS', value: '3' },
      { key: 'DONATION_HANDOVER_DAYS', value: ' 21 ' },
      { key: 'DONATION_CONFIRM_DAYS', value: '1.5' },
    ]);
    expect(await new SystemSettingService().getDonationSettings()).toEqual({
      decisionDays: 3,
      handoverDays: 21,
      confirmDays: 14,
    });
    await SystemSetting.deleteMany({});
    await SystemSetting.create([
      { key: 'DONATION_DECISION_DAYS', value: '0' },
      { key: 'DONATION_HANDOVER_DAYS', value: '-1' },
      { key: 'DONATION_CONFIRM_DAYS', value: 'mười' },
    ]);
    expect(await new SystemSettingService().getDonationSettings()).toEqual(
      DEFAULT_DONATION_SETTINGS,
    );
  });

  it('checks the UC30 catalogue settings against their range and keeps the default otherwise', async () => {
    await SystemSetting.create([
      { key: 'rental.platformFeeRate', value: '0.6' },
      { key: 'rental.ownerResponseHours', value: '0' },
      { key: 'rental.minTrustScore', value: '60' },
      { key: 'rental.returnReminderHours', value: '6' },
    ]);
    const s = await new SystemSettingService().getRentalSettings();
    expect(s.platformFeeRate).toBe(DEFAULT_RENTAL_SETTINGS.platformFeeRate);
    expect(s.ownerResponseHours).toBe(DEFAULT_RENTAL_SETTINGS.ownerResponseHours);
    expect(s.minTrustScore).toBe(60);
    // Not in the catalogue: read as before (any number from 0)
    expect(s.returnReminderHours).toBe(6);
  });

  it('reads the purchase settings: commission as a fraction, fee and time limits', async () => {
    expect(await new SystemSettingService().getPurchaseSettings()).toEqual(
      DEFAULT_PURCHASE_SETTINGS,
    );
    await SystemSetting.create([
      { key: 'purchase.commissionRate', value: '0.08' },
      { key: 'purchase.shippingFee', value: '25000' },
      { key: 'purchase.shipDeadlineHours', value: '24' },
      { key: 'purchase.autoCompleteDays', value: '31' },
    ]);
    expect(await new SystemSettingService().getPurchaseSettings()).toEqual({
      commissionRate: 0.08,
      shippingFee: 25_000,
      shipDeadlineHours: 24,
      autoCompleteDays: DEFAULT_PURCHASE_SETTINGS.autoCompleteDays,
    });
  });

  it('reads the withdrawal limits and falls back to both defaults when min > max', async () => {
    const service = new SystemSettingService();
    expect(await service.getWithdrawalLimits()).toEqual(DEFAULT_WITHDRAWAL_LIMITS);
    await SystemSetting.create([
      { key: 'withdrawal.minAmount', value: '100000' },
      { key: 'withdrawal.maxAmount', value: '5000000' },
    ]);
    expect(await service.getWithdrawalLimits()).toEqual({ minAmount: 100_000, maxAmount: 5_000_000 });
    expect(await service.getPublicSettings()).toEqual({
      withdrawal: { minAmount: 100_000, maxAmount: 5_000_000 },
    });
    await SystemSetting.updateOne({ key: 'withdrawal.minAmount' }, { value: '6000000' });
    expect(await service.getWithdrawalLimits()).toEqual(DEFAULT_WITHDRAWAL_LIMITS);
  });
});

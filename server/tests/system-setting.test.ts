import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PURCHASE_TIMINGS } from '../src/constants/order-timing.js';
import { SystemSetting } from '../src/models/system-setting.model.js';
import { SystemSettingService } from '../src/services/system-setting.service.js';
import { DEFAULT_RENTAL_SETTINGS } from '../src/types/rental-order.types.js';
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
});

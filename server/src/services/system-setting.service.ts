import { type Model } from 'mongoose';
import { type ISystemSetting, SystemSetting } from '../models/system-setting.model.js';
import { DEFAULT_RENTAL_SETTINGS, type RentalSettings } from '../types/rental-order.types.js';

export class SystemSettingService {
  private readonly model: Model<ISystemSetting>;

  public constructor(model: Model<ISystemSetting> = SystemSetting) {
    this.model = model;
  }

  public async getRentalSettings(): Promise<RentalSettings> {
    const keys: (keyof RentalSettings)[] = [
      'ownerResponseHours',
      'paymentHours',
      'receiptAutoConfirmHours',
      'settlementHours',
      'returnReminderHours',
      'platformFeeRate',
      'lateFeeMultiplier',
      'minTrustScore',
      'maxDays',
      'bookingWindowDays',
    ];

    const dbKeys = keys.map((k) => `rental.${k}`);
    const rows = await this.model.find({ key: { $in: dbKeys } }).lean();

    const rowMap = new Map<string, string>();
    for (const row of rows) {
      rowMap.set(row.key, row.value);
    }

    const result: RentalSettings = { ...DEFAULT_RENTAL_SETTINGS };

    for (const key of keys) {
      const storedVal = rowMap.get(`rental.${key}`);
      if (storedVal !== undefined) {
        const parsed = Number(storedVal);
        if (Number.isFinite(parsed) && parsed >= 0) {
          result[key] = parsed;
        }
      }
    }

    return result;
  }
}

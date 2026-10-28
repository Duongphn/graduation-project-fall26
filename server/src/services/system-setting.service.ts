import { type Model } from 'mongoose';
import { type ISystemSetting, SystemSetting } from '../models/system-setting.model.js';
import { DEFAULT_RENTAL_SETTINGS, type RentalSettings } from '../types/rental-order.types.js';

export class SystemSettingService {
  private readonly model: Model<ISystemSetting>;

  public constructor(model: Model<ISystemSetting> = SystemSetting) {
    this.model = model;
  }

  public async getNumbers<T extends Record<keyof T, number>>(
    prefix: string,
    defaults: T,
    max?: Partial<Record<keyof T, number>>,
  ): Promise<T> {
    const keys = Object.keys(defaults) as (keyof T)[];
    const dbKeys = keys.map((k) => `${prefix}.${String(k)}`);
    const rows = await this.model.find({ key: { $in: dbKeys } }).lean();

    const rowMap = new Map<string, string>();
    for (const row of rows) {
      rowMap.set(row.key, row.value);
    }

    const result = { ...defaults };

    for (const key of keys) {
      const storedVal = rowMap.get(`${prefix}.${String(key)}`);
      if (storedVal !== undefined) {
        const parsed = Number(storedVal);
        if (Number.isFinite(parsed) && parsed >= 0) {
          const maxVal = max?.[key];
          if (maxVal === undefined || parsed <= maxVal) {
            result[key] = parsed as T[keyof T];
          }
        }
      }
    }

    return result;
  }

  public async getRentalSettings(): Promise<RentalSettings> {
    return this.getNumbers('rental', DEFAULT_RENTAL_SETTINGS, {
      cancelFeeRate: 1,
      platformFeeRate: 1,
    });
  }
}

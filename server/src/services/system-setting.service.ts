import { type Model } from 'mongoose';
import { type ISystemSetting, SystemSetting } from '../models/system-setting.model.js';
import { DEFAULT_RENTAL_SETTINGS, type RentalSettings } from '../types/rental-order.types.js';
import {
  DEFAULT_DONATION_SETTINGS,
  DONATION_SETTING_KEYS,
  type DonationSettings,
} from '../constants/donation-request-transitions.js';

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

  /**
   * GB-57 donation time limits (UC30): DONATION_DECISION_DAYS, DONATION_HANDOVER_DAYS and
   * DONATION_CONFIRM_DAYS. A missing value, or one that is not a whole number of days from 1,
   * keeps its default (14).
   */
  public async getDonationSettings(): Promise<DonationSettings> {
    const entries = Object.entries(DONATION_SETTING_KEYS) as Array<
      [keyof DonationSettings, string]
    >;
    const rows = await this.model.find({ key: { $in: entries.map(([, key]) => key) } }).lean();
    const stored = new Map(rows.map((row) => [row.key, row.value]));

    const result: DonationSettings = { ...DEFAULT_DONATION_SETTINGS };
    for (const [field, key] of entries) {
      const text = stored.get(key)?.trim();
      const parsed = text ? Number(text) : Number.NaN;
      if (Number.isInteger(parsed) && parsed >= 1) result[field] = parsed;
    }
    return result;
  }
}

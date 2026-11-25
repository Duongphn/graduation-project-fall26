import { type Model } from 'mongoose';
import { type ISystemSetting, SystemSetting } from '../models/system-setting.model.js';
import { DEFAULT_RENTAL_SETTINGS, type RentalSettings } from '../types/rental-order.types.js';
import {
  DEFAULT_DONATION_SETTINGS,
  DONATION_SETTING_KEYS,
  type DonationSettings,
} from '../constants/donation-request-transitions.js';
import {
  DEFAULT_PURCHASE_SETTINGS,
  DEFAULT_WITHDRAWAL_LIMITS,
  findSettingDefinition,
  type PurchaseSettings,
  SETTING_KEYS,
  type WithdrawalLimits,
} from '../constants/system-settings.js';
import { readStoredValue, toEffectiveValue } from './system-setting.rules.js';

/** Settings that a public page may show (GET /settings/public): no Admin-only threshold. */
export interface PublicSettings {
  withdrawal: WithdrawalLimits;
}

/**
 * Reads the System Settings (UC30) that the code uses. Each read takes the latest saved values;
 * callers read them when a transaction is created and keep a copy on it (GB-38). A missing or
 * invalid stored value keeps its default.
 */
export class SystemSettingService {
  private readonly model: Model<ISystemSetting>;

  public constructor(model: Model<ISystemSetting> = SystemSetting) {
    this.model = model;
  }

  private async storedValues(keys: string[]): Promise<Map<string, string>> {
    const rows = await this.model
      .find({ key: { $in: keys } })
      .select('key value')
      .lean();
    return new Map(rows.map((row) => [row.key, row.value]));
  }

  /**
   * The effective value of a catalogue setting (a rate as a fraction), or the fallback when the
   * stored value is missing or not valid for the setting.
   */
  private static effective(key: string, stored: Map<string, string>, fallback: number): number {
    const definition = findSettingDefinition(key);
    if (!definition) return fallback;
    const shown = readStoredValue(definition, stored.get(key));
    return shown === undefined ? fallback : toEffectiveValue(definition, shown);
  }

  public async getRentalSettings(): Promise<RentalSettings> {
    const keys = Object.keys(DEFAULT_RENTAL_SETTINGS) as (keyof RentalSettings)[];
    const stored = await this.storedValues(keys.map((k) => `rental.${k}`));

    const result: RentalSettings = { ...DEFAULT_RENTAL_SETTINGS };

    for (const key of keys) {
      const dbKey = `rental.${key}`;
      if (findSettingDefinition(dbKey)) {
        // Settings of the UC30 catalogue: checked against their range and kind
        result[key] = SystemSettingService.effective(dbKey, stored, result[key]);
        continue;
      }
      // Others (maxDays, bookingWindowDays, returnReminderHours): any number from 0, as before
      const storedVal = stored.get(dbKey);
      if (storedVal !== undefined) {
        const parsed = Number(storedVal);
        if (Number.isFinite(parsed) && parsed >= 0) {
          result[key] = parsed;
        }
      }
    }

    return result;
  }

  /**
   * GB-57 donation time limits (UC30): DONATION_DECISION_DAYS, DONATION_HANDOVER_DAYS and
   * DONATION_CONFIRM_DAYS. A missing value, or one that is not a whole number of days from 1 to
   * 90, keeps its default (14).
   */
  public async getDonationSettings(): Promise<DonationSettings> {
    const entries = Object.entries(DONATION_SETTING_KEYS) as Array<
      [keyof DonationSettings, string]
    >;
    const stored = await this.storedValues(entries.map(([, key]) => key));

    const result: DonationSettings = { ...DEFAULT_DONATION_SETTINGS };
    for (const [field, key] of entries) {
      result[field] = SystemSettingService.effective(key, stored, result[field]);
    }
    return result;
  }

  /** Commission, delivery fee and time limits of a new purchase order (GB-38). */
  public async getPurchaseSettings(): Promise<PurchaseSettings> {
    const fields: Array<[keyof PurchaseSettings, string]> = [
      ['commissionRate', SETTING_KEYS.purchaseCommissionRate],
      ['shippingFee', SETTING_KEYS.purchaseShippingFee],
      ['shipDeadlineHours', SETTING_KEYS.purchaseShipDeadlineHours],
      ['autoCompleteDays', SETTING_KEYS.purchaseAutoCompleteDays],
    ];
    const stored = await this.storedValues(fields.map(([, key]) => key));

    const result: PurchaseSettings = { ...DEFAULT_PURCHASE_SETTINGS };
    for (const [field, key] of fields) {
      result[field] = SystemSettingService.effective(key, stored, result[field]);
    }
    return result;
  }

  /**
   * Amount limits of one withdrawal request (UC21). If the stored minimum is above the stored
   * maximum (not possible through the Admin screen), both defaults are used.
   */
  public async getWithdrawalLimits(): Promise<WithdrawalLimits> {
    const stored = await this.storedValues([
      SETTING_KEYS.withdrawalMinAmount,
      SETTING_KEYS.withdrawalMaxAmount,
    ]);
    const limits: WithdrawalLimits = {
      minAmount: SystemSettingService.effective(
        SETTING_KEYS.withdrawalMinAmount,
        stored,
        DEFAULT_WITHDRAWAL_LIMITS.minAmount,
      ),
      maxAmount: SystemSettingService.effective(
        SETTING_KEYS.withdrawalMaxAmount,
        stored,
        DEFAULT_WITHDRAWAL_LIMITS.maxAmount,
      ),
    };
    return limits.minAmount <= limits.maxAmount ? limits : { ...DEFAULT_WITHDRAWAL_LIMITS };
  }

  public async getPublicSettings(): Promise<PublicSettings> {
    return { withdrawal: await this.getWithdrawalLimits() };
  }
}

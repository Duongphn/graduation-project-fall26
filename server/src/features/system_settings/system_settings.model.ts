import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Known settings and the type of their value. Orders copy the values they use when they
 * are created, so a change applies only to new transactions (GB-38).
 */
export const settingDefinitions = {
  OWNER_RESPONSE_HOURS: 'number',
  RENTAL_PAYMENT_HOURS: 'number',
  RECEIPT_CONFIRMATION_HOURS: 'number',
  RETURN_INSPECTION_HOURS: 'number',
  SELLER_CONFIRMATION_HOURS: 'number',
  BUYER_CONFIRMATION_HOURS: 'number',
  DISPUTE_RESPONSE_HOURS: 'number',
  RENTAL_PLATFORM_FEE_PERCENT: 'number',
  SALE_PLATFORM_FEE_PERCENT: 'number',
  TRUST_SCORE_MIN: 'number',
  HIGH_DEPOSIT_THRESHOLD: 'number',
  WITHDRAWAL_MAX_AMOUNT: 'number',
  // Minimum photos per toy post, checked by the moderation checklist (FE-03).
  TOY_MIN_PHOTOS_RENT: 'number',
  TOY_MIN_PHOTOS_SALE: 'number',
  TOY_MIN_PHOTOS_DONATION: 'number',
  // Minimum age to use the platform (GB-07).
  USER_MIN_AGE_YEARS: 'number',
  // Donation expiry job (R03 job 9, UC "Step 5.1_Expiration"): days a request may stay
  // PENDING without a decision, and ACCEPTED without the Donor's handover.
  DONATION_PENDING_EXPIRY_DAYS: 'number',
  DONATION_HANDOVER_EXPIRY_DAYS: 'number',
} as const;

export type SettingKey = keyof typeof settingDefinitions;
export const settingKeys = Object.keys(settingDefinitions) as SettingKey[];

/** Values written by seedDefaultSettings when a key is missing; an Admin may change them. */
export const settingDefaults: Partial<Record<SettingKey, number>> = {
  TOY_MIN_PHOTOS_RENT: 3,
  TOY_MIN_PHOTOS_SALE: 4,
  TOY_MIN_PHOTOS_DONATION: 3,
  USER_MIN_AGE_YEARS: 18,
  DONATION_PENDING_EXPIRY_DAYS: 14,
  DONATION_HANDOVER_EXPIRY_DAYS: 14,
};

const systemSettingSchema = new Schema(
  {
    key: { type: String, enum: settingKeys, required: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String, trim: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { collection: 'system_settings', timestamps: true },
);

systemSettingSchema.pre('validate', function checkValueType() {
  const expected = settingDefinitions[this.key as SettingKey];
  if (expected === 'number' && (typeof this.value !== 'number' || !Number.isFinite(this.value))) {
    this.invalidate('value', `${this.key} must be a number.`);
  }
});

systemSettingSchema.index({ key: 1 }, { unique: true, name: 'key_unique' });

export type SystemSetting = InferSchemaType<typeof systemSettingSchema>;
export const SystemSettingModel = model('SystemSetting', systemSettingSchema);

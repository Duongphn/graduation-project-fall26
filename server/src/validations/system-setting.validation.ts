import { settingGroups, settingUnits } from '../constants/system-settings.js';
import { isoDateTimeSchema, objectIdSchema } from './common.validation.js';
import { z } from './zod.js';

// System Settings (UC30): Admin list, update and reset. The range of each value depends on the
// setting, so the service checks the value against the catalogue (constants/system-settings.ts).

export const SETTING_NOTE_MAX = 200;

export const settingKeyParamsSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .openapi({ example: 'rental.platformFeeRate', description: 'Setting key' }),
});
export type SettingKeyParams = z.infer<typeof settingKeyParamsSchema>;

const noteSchema = z
  .string({ error: 'Ghi chú phải là chuỗi ký tự.' })
  .trim()
  .max(SETTING_NOTE_MAX, `Ghi chú tối đa ${SETTING_NOTE_MAX} ký tự.`)
  .transform((note) => note || undefined)
  .optional()
  .describe('Why the Admin changes it (optional, written to the audit log)');

export const updateSettingBodySchema = z
  .object({
    value: z
      .union([z.number(), z.string().max(30, 'Giá trị quá dài.')], {
        error: 'Giá trị phải là một số.',
      })
      .describe(
        'New value in the shown unit: a rate in percent (12.5), hours, days, VND or points. ' +
          'A text may have spaces around it, a decimal comma ("12,5") or thousand dots ("50.000").',
      )
      .openapi({ example: 12 }),
    note: noteSchema,
  })
  .strict()
  .openapi('UpdateSystemSettingRequest');
export type UpdateSettingBody = z.infer<typeof updateSettingBodySchema>;

export const resetSettingBodySchema = z
  .object({ note: noteSchema })
  .strict()
  .openapi('ResetSystemSettingRequest');
export type ResetSettingBody = z.infer<typeof resetSettingBodySchema>;

export const adminSettingSchema = z
  .object({
    key: z.string(),
    group: z.enum(settingGroups),
    groupLabel: z.string(),
    label: z.string(),
    description: z.string(),
    appliesTo: z.string().describe('Which transactions take a new value (GB-38)'),
    unit: z.enum(settingUnits),
    unitLabel: z.string(),
    min: z.number(),
    max: z.number(),
    decimals: z.number().int(),
    value: z.number().describe('Value in use, in the shown unit (percent for rates)'),
    defaultValue: z.number(),
    isDefault: z.boolean(),
    invalidStoredValue: z
      .string()
      .nullable()
      .describe('Stored text that is not valid for the setting; the default is used instead'),
    updatedAt: isoDateTimeSchema.nullable(),
    updatedBy: z.object({ id: objectIdSchema, fullName: z.string().nullable() }).nullable(),
  })
  .openapi('AdminSystemSetting');
export type AdminSettingItem = z.infer<typeof adminSettingSchema>;

export const publicSettingsSchema = z
  .object({
    withdrawal: z.object({ minAmount: z.number().int(), maxAmount: z.number().int() }),
  })
  .openapi('PublicSystemSettings');

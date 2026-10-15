import { settingDefaults, SystemSettingModel, type SettingKey } from './system_settings.model.js';

/**
 * Inserts the default value of every setting that is missing. Existing values are never
 * overwritten, so it is safe to run on every deployment (it runs in syncDatabase).
 */
export const seedDefaultSettings = async (): Promise<void> => {
  const entries = Object.entries(settingDefaults) as Array<[SettingKey, number]>;
  if (entries.length === 0) return;
  await SystemSettingModel.bulkWrite(
    entries.map(([key, value]) => ({
      updateOne: {
        filter: { key },
        update: { $setOnInsert: { key, value } },
        upsert: true,
      },
    })),
  );
};

/** The numeric value of a setting, or its default when it is missing or not a number. */
export const getNumberSetting = async (key: SettingKey): Promise<number | undefined> => {
  const setting = await SystemSettingModel.findOne({ key }, { value: 1 }).lean();
  return typeof setting?.value === 'number' ? setting.value : settingDefaults[key];
};

import { Types } from 'mongoose';

import {
  findSettingDefinition,
  type SettingDefinition,
  SETTING_KEYS,
  settingGroupLabels,
  settingUnitLabels,
  SYSTEM_SETTINGS,
} from '../constants/system-settings.js';
import { type ISystemSetting, SystemSetting } from '../models/system-setting.model.js';
import {
  adminAuditEntry,
  findActorNames,
  writeAuditLog,
} from '../repositories/audit-log.repository.js';
import type { AdminContext } from '../utils/admin-context.js';
import { badRequest, conflict, notFound } from '../utils/http-errors.js';
import { withTransaction } from '../utils/transaction.js';
import type { AdminSettingItem } from '../validations/system-setting.validation.js';
import {
  formatSettingValue,
  parseSettingInput,
  readStoredValue,
  toStoredText,
} from './system-setting.rules.js';

// UC30 Configure System, Admin side: Setting List (screen 56) and Setting Detail (screen 57).
// Every change writes one audit row with the old and new value (UC31, R04 3.23) in the same
// transaction. The new value is used by transactions created after the save (GB-38).

type StoredSetting = Pick<ISystemSetting, 'key' | 'value' | 'updatedBy' | 'updatedAt'> & {
  _id: Types.ObjectId;
};

const settingNotFound = () => notFound('SETTING_NOT_FOUND', 'Không tìm thấy cấu hình.');

/** VALIDATION_ERROR on the `value` field, the shape the Setting Detail form shows. */
const invalidValue = (message: string) =>
  badRequest('VALIDATION_ERROR', message, [{ field: 'value', message }]);

const definitionOf = (key: string): SettingDefinition => {
  const definition = findSettingDefinition(key);
  if (!definition) throw settingNotFound();
  return definition;
};

/** The value in use: the stored one when it is valid for the setting, the default otherwise. */
const currentValue = (definition: SettingDefinition, row?: StoredSetting | null) =>
  readStoredValue(definition, row?.value) ?? definition.defaultValue;

const toItem = (
  definition: SettingDefinition,
  row: StoredSetting | undefined | null,
  names: Map<string, string>,
): AdminSettingItem => {
  const stored = row ? readStoredValue(definition, row.value) : undefined;
  const value = stored ?? definition.defaultValue;
  return {
    key: definition.key,
    group: definition.group,
    groupLabel: settingGroupLabels[definition.group],
    label: definition.label,
    description: definition.description,
    appliesTo: definition.appliesTo,
    unit: definition.unit,
    unitLabel: settingUnitLabels[definition.unit],
    min: definition.min,
    max: definition.max,
    decimals: definition.decimals,
    value,
    defaultValue: definition.defaultValue,
    isDefault: value === definition.defaultValue,
    invalidStoredValue: row && stored === undefined ? row.value : null,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    updatedBy: row?.updatedBy
      ? { id: String(row.updatedBy), fullName: names.get(String(row.updatedBy)) ?? null }
      : null,
  };
};

const findRows = (keys: string[]) =>
  SystemSetting.find({ key: { $in: keys } })
    .select('key value updatedBy updatedAt')
    .lean<StoredSetting[]>();

const itemsOf = async (definitions: readonly SettingDefinition[]) => {
  const rows = await findRows(definitions.map((definition) => definition.key));
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const adminIds = [
    ...new Map(
      rows.filter((row) => row.updatedBy).map((row) => [String(row.updatedBy), row.updatedBy!]),
    ).values(),
  ];
  const names = await findActorNames(adminIds);
  return definitions.map((definition) => toItem(definition, byKey.get(definition.key), names));
};

/** Setting List: every setting of the catalogue, in its group order. */
export const listSettings = async (): Promise<AdminSettingItem[]> => itemsOf(SYSTEM_SETTINGS);

export const getSetting = async (key: string): Promise<AdminSettingItem> => {
  const [item] = await itemsOf([definitionOf(key)]);
  return item!;
};

/**
 * The minimum withdrawal can never go above the maximum (and the other way round), compared with
 * the value of the other limit that is in use now.
 */
interface LimitPair {
  other: string;
  ok: (value: number, other: number) => boolean;
  message: (other: string) => string;
}

const withdrawalPairs: Record<string, LimitPair> = {
  [SETTING_KEYS.withdrawalMinAmount]: {
    other: SETTING_KEYS.withdrawalMaxAmount,
    ok: (value, other) => value <= other,
    message: (other) => `Số tiền rút tối thiểu không được lớn hơn số tiền rút tối đa (${other}).`,
  },
  [SETTING_KEYS.withdrawalMaxAmount]: {
    other: SETTING_KEYS.withdrawalMinAmount,
    ok: (value, other) => value >= other,
    message: (other) => `Số tiền rút tối đa không được nhỏ hơn số tiền rút tối thiểu (${other}).`,
  },
};

const assertWithdrawalOrder = async (definition: SettingDefinition, value: number) => {
  const pair = withdrawalPairs[definition.key];
  if (!pair) return;
  const otherDefinition = definitionOf(pair.other);
  const otherRow = await SystemSetting.findOne({ key: pair.other }).select('value').lean();
  const other = currentValue(otherDefinition, otherRow as StoredSetting | null);
  if (!pair.ok(value, other)) {
    throw invalidValue(pair.message(formatSettingValue(otherDefinition, other)));
  }
};

interface ChangeInput {
  action: 'setting.update' | 'setting.reset';
  value: number;
  note?: string | undefined;
}

const saveChange = async (
  definition: SettingDefinition,
  { action, value, note }: ChangeInput,
  context: AdminContext,
): Promise<void> => {
  await withTransaction(async (session) => {
    const before = await SystemSetting.findOne({ key: definition.key })
      .session(session)
      .lean<StoredSetting | null>();
    const oldValue = currentValue(definition, before);
    const saved = await SystemSetting.findOneAndUpdate(
      { key: definition.key },
      {
        $set: {
          value: toStoredText(definition, value),
          description: definition.label,
          updatedBy: new Types.ObjectId(context.actor.actorId),
        },
      },
      { upsert: true, new: true, session },
    ).lean<StoredSetting>();
    await writeAuditLog(
      adminAuditEntry(
        context,
        action,
        { kind: 'SYSTEM_SETTING', id: String(saved!._id) },
        {
          setting: definition.label,
          key: definition.key,
          oldValue: formatSettingValue(definition, oldValue),
          newValue: formatSettingValue(definition, value),
          ...(before && readStoredValue(definition, before.value) === undefined
            ? { invalidStored: before.value }
            : {}),
          ...(note ? { note } : {}),
        },
      ),
      session,
    );
  });
};

/** Setting Detail: saves a new value (shown unit) and logs old → new. */
export const updateSetting = async (
  key: string,
  input: { value: number | string; note?: string | undefined },
  context: AdminContext,
): Promise<AdminSettingItem> => {
  const definition = definitionOf(key);
  const parsed = parseSettingInput(definition, input.value);
  if (!parsed.ok) throw invalidValue(parsed.message);

  const row = await SystemSetting.findOne({ key: definition.key }).lean<StoredSetting | null>();
  const storedIsValid = !row || readStoredValue(definition, row.value) !== undefined;
  if (storedIsValid && parsed.value === currentValue(definition, row)) {
    throw invalidValue('Giá trị mới trùng với giá trị đang áp dụng.');
  }
  await assertWithdrawalOrder(definition, parsed.value);

  await saveChange(
    definition,
    { action: 'setting.update', value: parsed.value, note: input.note },
    context,
  );
  return getSetting(definition.key);
};

/** Back to the default value (also repairs a stored value that is not valid). */
export const resetSetting = async (
  key: string,
  input: { note?: string | undefined },
  context: AdminContext,
): Promise<AdminSettingItem> => {
  const definition = definitionOf(key);
  const row = await SystemSetting.findOne({ key: definition.key }).lean<StoredSetting | null>();
  const storedIsValid = !row || readStoredValue(definition, row.value) !== undefined;
  if (storedIsValid && currentValue(definition, row) === definition.defaultValue) {
    throw conflict('SETTING_ALREADY_DEFAULT', 'Cấu hình đang dùng giá trị mặc định.');
  }
  await assertWithdrawalOrder(definition, definition.defaultValue);

  await saveChange(
    definition,
    { action: 'setting.reset', value: definition.defaultValue, note: input.note },
    context,
  );
  return getSetting(definition.key);
};

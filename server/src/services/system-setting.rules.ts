import { type SettingDefinition, settingUnitLabels } from '../constants/system-settings.js';

// Pure rules of the System Settings (UC30): reading a stored value, checking what the Admin
// typed and showing a value with its unit. Values are in the shown unit (percent for rates).

const vnNumber = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

/** 10 → "10%", 24 → "24 giờ", 500000 → "500.000 VND", 1.5 → "1,5 lần". */
export const formatSettingValue = (definition: SettingDefinition, value: number): string =>
  definition.unit === 'PERCENT'
    ? `${vnNumber(value)}%`
    : `${vnNumber(value)} ${settingUnitLabels[definition.unit]}`;

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

const hasAtMostDecimals = (value: number, decimals: number) =>
  Math.abs(round(value, decimals) - value) < 1e-9;

const inRange = (definition: SettingDefinition, value: number) =>
  value >= definition.min && value <= definition.max;

/**
 * The shown value of a stored text, or undefined when it is missing or not valid for the setting
 * (not a number, outside the range, a fraction for a whole-number setting): the caller then
 * keeps the default, as before UC30.
 */
export const readStoredValue = (
  definition: SettingDefinition,
  raw: string | undefined | null,
): number | undefined => {
  const text = raw?.trim();
  if (!text) return undefined;
  const stored = Number(text);
  if (!Number.isFinite(stored)) return undefined;
  const shown = round(stored * definition.scale, 6);
  if (definition.decimals === 0 && !Number.isInteger(shown)) return undefined;
  return inRange(definition, shown) ? shown : undefined;
};

/** What the code uses: the shown value divided by the scale (a percent becomes a fraction). */
export const toEffectiveValue = (definition: SettingDefinition, shown: number): number =>
  definition.scale === 1 ? shown : round(shown / definition.scale, 8);

/** Text stored in systemsettings.value: "0.12" for 12%, "24" for 24 hours. */
export const toStoredText = (definition: SettingDefinition, shown: number): string =>
  String(toEffectiveValue(definition, shown));

export type SettingInputResult = { ok: true; value: number } | { ok: false; message: string };

const WHOLE = /^-?\d+$/;
// 50.000 / 50,000 / 50 000: thousand groups of a whole number (VND)
const GROUPED = /^-?\d{1,3}(?:([.,\s])\d{3})(?:\1\d{3})*$/;
const DECIMAL = /^-?\d+[.,]\d+$/;

const parseText = (definition: SettingDefinition, text: string): SettingInputResult => {
  if (definition.decimals === 0) {
    if (WHOLE.test(text)) return { ok: true, value: Number(text) };
    if (GROUPED.test(text)) return { ok: true, value: Number(text.replace(/[.,\s]/g, '')) };
    if (DECIMAL.test(text)) return { ok: false, message: 'Giá trị phải là số nguyên.' };
    return { ok: false, message: 'Giá trị phải là một số.' };
  }
  if (WHOLE.test(text) || DECIMAL.test(text)) {
    return { ok: true, value: Number(text.replace(',', '.')) };
  }
  return { ok: false, message: 'Giá trị phải là một số.' };
};

/**
 * Checks the value the Admin typed, in the shown unit. Accepts a number or a text with spaces
 * around it, a decimal comma ("12,5") and, for whole numbers, thousand separators ("50.000").
 */
export const parseSettingInput = (
  definition: SettingDefinition,
  input: unknown,
): SettingInputResult => {
  let value: number;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return { ok: false, message: 'Giá trị phải là một số.' };
    value = input;
  } else if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return { ok: false, message: 'Vui lòng nhập giá trị.' };
    const parsed = parseText(definition, text);
    if (!parsed.ok) return parsed;
    value = parsed.value;
  } else if (input === undefined || input === null) {
    return { ok: false, message: 'Vui lòng nhập giá trị.' };
  } else {
    return { ok: false, message: 'Giá trị phải là một số.' };
  }

  if (definition.decimals === 0 && !Number.isInteger(value)) {
    return { ok: false, message: 'Giá trị phải là số nguyên.' };
  }
  if (!hasAtMostDecimals(value, definition.decimals)) {
    return {
      ok: false,
      message: `Chỉ nhập tối đa ${definition.decimals} chữ số thập phân.`,
    };
  }
  if (!inRange(definition, value)) {
    return {
      ok: false,
      message: `Giá trị phải từ ${formatSettingValue(definition, definition.min)} đến ${formatSettingValue(definition, definition.max)}.`,
    };
  }
  return { ok: true, value: round(value, definition.decimals) };
};

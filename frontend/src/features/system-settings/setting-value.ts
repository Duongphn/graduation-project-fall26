import type { AdminSetting } from './types'

// Same rules as server/src/services/system-setting.rules.ts, so the form shows the server's
// messages before sending. Values are in the shown unit (percent for rates).

type SettingRules = Pick<AdminSetting, 'unit' | 'unitLabel' | 'min' | 'max' | 'decimals'>

const vnNumber = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })

/** 10 → "10%", 24 → "24 giờ", 500000 → "500.000 VND", 1.5 → "1,5 lần". */
export const formatSettingValue = (setting: Pick<AdminSetting, 'unit' | 'unitLabel'>, value: number) =>
  setting.unit === 'PERCENT' ? `${vnNumber(value)}%` : `${vnNumber(value)} ${setting.unitLabel}`

/** "0%–50%", "1–168 giờ". */
export const formatSettingRange = (setting: SettingRules) =>
  setting.unit === 'PERCENT'
    ? `${vnNumber(setting.min)}%–${vnNumber(setting.max)}%`
    : `${vnNumber(setting.min)}–${vnNumber(setting.max)} ${setting.unitLabel}`

/** The current value as the form shows it: "12,5" (decimal comma), "500000". */
export const toInputText = (value: number) => String(value).replace('.', ',')

export type SettingInputResult = { ok: true; value: number } | { ok: false; message: string }

const WHOLE = /^-?\d+$/
// 50.000 / 50,000 / 50 000: thousand groups of a whole number (VND)
const GROUPED = /^-?\d{1,3}(?:([.,\s])\d{3})(?:\1\d{3})*$/
const DECIMAL = /^-?\d+[.,]\d+$/

const round = (value: number, decimals: number) => Number(value.toFixed(decimals))

/**
 * Checks what the Admin typed: spaces around it, a decimal comma ("12,5") and, for whole
 * numbers, thousand separators ("50.000") are accepted.
 */
export const parseSettingInput = (setting: SettingRules, input: string): SettingInputResult => {
  const text = input.trim()
  if (!text) return { ok: false, message: 'Vui lòng nhập giá trị.' }
  let value: number
  if (setting.decimals === 0) {
    if (WHOLE.test(text)) value = Number(text)
    else if (GROUPED.test(text)) value = Number(text.replace(/[.,\s]/g, ''))
    else if (DECIMAL.test(text)) return { ok: false, message: 'Giá trị phải là số nguyên.' }
    else return { ok: false, message: 'Giá trị phải là một số.' }
  } else if (WHOLE.test(text) || DECIMAL.test(text)) {
    value = Number(text.replace(',', '.'))
  } else {
    return { ok: false, message: 'Giá trị phải là một số.' }
  }
  if (Math.abs(round(value, setting.decimals) - value) >= 1e-9) {
    return { ok: false, message: `Chỉ nhập tối đa ${setting.decimals} chữ số thập phân.` }
  }
  if (value < setting.min || value > setting.max) {
    return {
      ok: false,
      message: `Giá trị phải từ ${formatSettingValue(setting, setting.min)} đến ${formatSettingValue(setting, setting.max)}.`,
    }
  }
  return { ok: true, value: round(value, setting.decimals) }
}

export const WITHDRAWAL_MIN_KEY = 'withdrawal.minAmount'
export const WITHDRAWAL_MAX_KEY = 'withdrawal.maxAmount'

/**
 * The minimum withdrawal can never go above the maximum (and the other way round), compared with
 * the value in use of the other limit. Undefined when the value is fine.
 */
export const withdrawalOrderError = (
  setting: Pick<AdminSetting, 'key'>,
  value: number,
  settings: readonly AdminSetting[],
): string | undefined => {
  const otherKey =
    setting.key === WITHDRAWAL_MIN_KEY
      ? WITHDRAWAL_MAX_KEY
      : setting.key === WITHDRAWAL_MAX_KEY
        ? WITHDRAWAL_MIN_KEY
        : undefined
  const other = settings.find((item) => item.key === otherKey)
  if (!other) return undefined
  const shown = formatSettingValue(other, other.value)
  if (setting.key === WITHDRAWAL_MIN_KEY && value > other.value) {
    return `Số tiền rút tối thiểu không được lớn hơn số tiền rút tối đa (${shown}).`
  }
  if (setting.key === WITHDRAWAL_MAX_KEY && value < other.value) {
    return `Số tiền rút tối đa không được nhỏ hơn số tiền rút tối thiểu (${shown}).`
  }
  return undefined
}

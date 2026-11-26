import { z } from 'zod'

import { parseSettingInput, withdrawalOrderError } from './setting-value'
import type { AdminSetting } from './types'

export const SETTING_NOTE_MAX = 200

export interface SettingFormValues {
  // The text typed by the Admin, checked with the server's rules.
  value: string
  note: string
}

// Setting Detail form (UC30): the value must fit the setting, differ from the value in use and
// keep the minimum withdrawal at or below the maximum.
export const settingFormSchema = (setting: AdminSetting, settings: readonly AdminSetting[]) =>
  z
    .object({
      value: z.string(),
      note: z.string().trim().max(SETTING_NOTE_MAX, `Ghi chú tối đa ${SETTING_NOTE_MAX} ký tự.`),
    })
    .superRefine((values, context) => {
      const parsed = parseSettingInput(setting, values.value)
      const issue = (message: string) =>
        context.addIssue({ code: 'custom', path: ['value'], message })
      if (!parsed.ok) return issue(parsed.message)
      // A stored value that is not valid can be overwritten with the same value (repair).
      if (parsed.value === setting.value && setting.invalidStoredValue === null) {
        return issue('Giá trị mới trùng với giá trị đang áp dụng.')
      }
      const orderError = withdrawalOrderError(setting, parsed.value, settings)
      if (orderError) issue(orderError)
    })

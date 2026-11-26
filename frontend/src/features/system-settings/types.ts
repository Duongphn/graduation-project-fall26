// System Settings (UC30). Shapes match server/src/validations/system-setting.validation.ts.

export type SettingGroup = 'RENTAL' | 'PURCHASE' | 'WALLET' | 'TRUST' | 'DONATION'

export type SettingUnit = 'PERCENT' | 'MULTIPLIER' | 'HOURS' | 'DAYS' | 'VND' | 'POINTS'

export interface AdminSetting {
  key: string
  group: SettingGroup
  groupLabel: string
  label: string
  description: string
  // Which transactions take a new value (GB-38).
  appliesTo: string
  unit: SettingUnit
  unitLabel: string
  // Allowed range and decimals, in the shown unit (percent for rates).
  min: number
  max: number
  decimals: number
  value: number
  defaultValue: number
  isDefault: boolean
  // Stored text that is not valid for the setting: the default is used instead.
  invalidStoredValue: string | null
  updatedAt: string | null
  updatedBy: { id: string; fullName: string | null } | null
}

export interface UpdateSettingInput {
  key: string
  value: number
  note?: string
}

export interface ResetSettingInput {
  key: string
  note?: string
}

// GET /settings/public: values every user may see.
export interface PublicSettings {
  withdrawal: { minAmount: number; maxAmount: number }
}

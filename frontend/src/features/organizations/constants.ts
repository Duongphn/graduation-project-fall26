import type { AgeGroup, PublicReceivingPoint } from './types'

// The accepted age groups of a needs profile (GB-53): the toy age groups, stored in years,
// half-open [minAge, maxAge). Mirrors ORGANIZATION_AGE_GROUPS in the server rules.
export const organizationAgeGroups = [
  { key: '0-1', label: '0–12 tháng', minAge: 0, maxAge: 1 },
  { key: '1-3', label: '1–3 tuổi', minAge: 1, maxAge: 3 },
  { key: '3-6', label: '3–6 tuổi', minAge: 3, maxAge: 6 },
  { key: '6-12', label: '6–12 tuổi', minAge: 6, maxAge: 12 },
  { key: '12-99', label: '12+ tuổi', minAge: 12, maxAge: 99 },
] as const

export type AgeGroupKey = (typeof organizationAgeGroups)[number]['key']

export const ageGroupKey = (group: AgeGroup): string => `${group.minAge}-${group.maxAge}`

export const ageGroupLabel = (group: AgeGroup): string =>
  organizationAgeGroups.find((item) => item.key === ageGroupKey(group))?.label ??
  `${group.minAge}–${group.maxAge} tuổi`

// GB-51: the handover methods a receiving point accepts.
export const handoverMethodLabelsOf = (point: PublicReceivingPoint): string[] => [
  ...(point.acceptsDropOff ? ['Mang đến điểm nhận'] : []),
  ...(point.acceptsParcel ? ['Gửi qua vận chuyển'] : []),
]

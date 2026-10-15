import { ageGroupLabels } from '../constants/labels'
import type { AgeGroup } from '../constants/domain'
import { dayjs } from './dayjs'

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })

// 25000 -> "25.000 ₫"
export const formatMoney = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : vnd.format(value)

export const formatDate = (value: string | Date | null | undefined): string =>
  value ? dayjs(value).format('DD/MM/YYYY') : '—'

export const formatDateTime = (value: string | Date | null | undefined): string =>
  value ? dayjs(value).format('HH:mm DD/MM/YYYY') : '—'

// "3 giờ trước"
export const formatFromNow = (value: string | Date | null | undefined): string =>
  value ? dayjs(value).fromNow() : '—'

// "AGE_3_5" -> "3–5 tuổi"
export const formatAgeGroup = (value: AgeGroup | null | undefined): string =>
  value ? ageGroupLabels[value] : '—'

// ["AGE_3_5", "AGE_6_8"] -> "3–5 tuổi, 6–8 tuổi"
export const formatAgeGroups = (values: readonly AgeGroup[] | null | undefined): string =>
  values && values.length > 0 ? values.map((value) => ageGroupLabels[value]).join(', ') : '—'

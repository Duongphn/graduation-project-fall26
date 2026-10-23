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

// { minAge: 3, maxAge: 8 } -> "3–8 tuổi" (develop's toys.ageRange)
export const formatAgeRange = (
  value: { minAge: number; maxAge: number } | null | undefined,
): string => (value ? `${value.minAge}–${value.maxAge} tuổi` : '—')

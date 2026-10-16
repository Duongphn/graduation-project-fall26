import { z } from 'zod'

import { vietnamProvinces } from '../constants/provinces'

// Form rules shared by every feature. They mirror server/src/shared/http/schemas.ts.

// The reason an Admin gives when rejecting or hiding something.
export const REASON_MIN = 5
export const REASON_MAX = 500

export const reasonSchema = z
  .string()
  .trim()
  .min(REASON_MIN, `Lý do cần ít nhất ${REASON_MIN} ký tự.`)
  .max(REASON_MAX, `Lý do tối đa ${REASON_MAX} ký tự.`)

export const reasonFormSchema = z.object({ reason: reasonSchema })
export type ReasonFormValues = z.infer<typeof reasonFormSchema>

// 0912 345 678, 84912345678 or +84912345678 (the backend stores +84...).
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(?:\+84|84|0)[1-9]\d{8}$/, 'Số điện thoại không hợp lệ.')

export const provinceSchema = z.enum(vietnamProvinces, { error: 'Chọn tỉnh/thành phố.' })

export const imageUrlSchema = z.url({ protocol: /^https$/, error: 'Ảnh không hợp lệ.' })

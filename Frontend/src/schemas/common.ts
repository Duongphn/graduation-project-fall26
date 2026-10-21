import { z } from 'zod'

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

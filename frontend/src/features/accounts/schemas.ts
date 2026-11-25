import { z } from 'zod'

import { lockDurations, userRoles } from '../../constants/domain'
import { enumParam, searchParam } from '../../schemas/list-params'
import { accountTabs, accountTrustBands } from './types'

// Filters of the account list read from the URL (?tab=locked&role=USER&trustBand=low&q=…).
export const accountFiltersSchema = z.object({
  tab: z.enum(accountTabs).catch('all'),
  role: enumParam(userRoles),
  trustBand: enumParam(accountTrustBands),
  q: searchParam,
})

export const accountSortFields = ['createdAt', 'violationCount'] as const

// R03 III.7.2.1 (9): every lock or unlock has a reason of 20 to 300 characters.
export const ACCOUNT_REASON_MIN = 20
export const ACCOUNT_REASON_MAX = 300

export const accountReasonSchema = z
  .string()
  .trim()
  .min(ACCOUNT_REASON_MIN, `Lý do cần ít nhất ${ACCOUNT_REASON_MIN} ký tự.`)
  .max(ACCOUNT_REASON_MAX, `Lý do tối đa ${ACCOUNT_REASON_MAX} ký tự.`)

export const accountActionFormSchema = z.object({
  action: z.enum([...lockDurations, 'unlock'], { error: 'Vui lòng chọn thao tác.' }),
  reason: accountReasonSchema,
})
export type AccountActionFormValues = z.infer<typeof accountActionFormSchema>

// Trust Score decisions (UC29, FE-09): the same 20–300 character reason as a lock; a lock from the
// review also needs one of the three durations.
export const trustReasonFormSchema = z.object({ reason: accountReasonSchema })
export const trustLockFormSchema = z.object({
  duration: z.enum(lockDurations, { error: 'Vui lòng chọn thời hạn khóa.' }),
  reason: accountReasonSchema,
})
export type TrustDecisionFormValues = { reason: string; duration?: (typeof lockDurations)[number] }

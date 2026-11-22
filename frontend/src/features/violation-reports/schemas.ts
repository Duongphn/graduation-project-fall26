import { z } from 'zod'

import {
  lockDurations,
  reportActions,
  reportReasons,
  reportStatuses,
  reportTargetKinds,
} from '../../constants/domain'
import { enumParam } from '../../schemas/list-params'

// Filters of the report list read from the URL (?status=resolved&reason=unsafe_toy).
export const reportFiltersSchema = z.object({
  status: z.enum(reportStatuses).catch('pending'),
  reason: enumParam(reportReasons),
  targetKind: enumParam(reportTargetKinds),
})

export const NOTE_MAX = 300
const LOCK_NOTE_MIN = 20

// Mirrors the server's ResolveViolationReportRequest: a lock needs a duration and a note of 20 to
// 300 characters; the other actions a note of 5 to 300.
export const resolveFormSchema = z
  .object({
    action: z.enum(reportActions, { error: 'Vui lòng chọn cách xử lý.' }),
    lockDuration: z.enum(lockDurations).optional(),
    note: z
      .string()
      .trim()
      .min(5, 'Ghi chú cần ít nhất 5 ký tự.')
      .max(NOTE_MAX, `Ghi chú tối đa ${NOTE_MAX} ký tự.`),
  })
  .superRefine((values, context) => {
    if (values.action === 'lock' && !values.lockDuration) {
      context.addIssue({ code: 'custom', path: ['lockDuration'], message: 'Vui lòng chọn thời hạn khóa.' })
    }
    if (values.action === 'lock' && values.note.length < LOCK_NOTE_MIN) {
      context.addIssue({
        code: 'custom',
        path: ['note'],
        message: `Lý do khóa tài khoản cần ít nhất ${LOCK_NOTE_MIN} ký tự.`,
      })
    }
  })
export type ResolveFormValues = z.infer<typeof resolveFormSchema>

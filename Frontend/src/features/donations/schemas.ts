import { z } from 'zod'

import { donationReceiverTypes, donationStatuses } from '../../constants/domain'
import { reasonSchema } from '../../schemas/common'
import { enumParam, searchParam } from '../../schemas/list-params'

// Admin confirmation that the receiver got the toy: a required reason, optional photos and note.
export const confirmReceivedSchema = z.object({
  reason: reasonSchema,
  photos: z
    .array(z.object({ publicId: z.string(), url: z.string(), format: z.string() }))
    .max(10, 'Tối đa 10 ảnh.'),
  note: z.string().trim().max(1000, 'Tối đa 1000 ký tự.'),
})
export type ConfirmReceivedValues = z.infer<typeof confirmReceivedSchema>

// Filters of the Admin list read from the URL (useListParams).
export const donationFiltersSchema = z.object({
  status: enumParam(donationStatuses),
  receiverType: enumParam(donationReceiverTypes),
  q: searchParam,
})

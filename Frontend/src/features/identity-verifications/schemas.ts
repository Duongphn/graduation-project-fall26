import { z } from 'zod'

import { verificationStatuses } from '../../constants/domain'
import { searchParam } from '../../schemas/list-params'

// Filters of the queue read from the URL (useListParams). The tab (?status=VERIFIED) falls back
// to PENDING for anything else.
export const identityQueueFiltersSchema = z.object({
  status: z.enum(verificationStatuses).catch('PENDING'),
  q: searchParam,
})

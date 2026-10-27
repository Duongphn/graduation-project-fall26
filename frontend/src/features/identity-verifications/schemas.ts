import { z } from 'zod'

import { verificationStatuses } from '../../constants/domain'
import { searchParam } from '../../schemas/list-params'

// Filters of the queue read from the URL (useListParams). The tab (?status=verified) falls back
// to pending for anything else.
export const identityQueueFiltersSchema = z.object({
  status: z.enum(verificationStatuses).catch('pending'),
  q: searchParam,
})

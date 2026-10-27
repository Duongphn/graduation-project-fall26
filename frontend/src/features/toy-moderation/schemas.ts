import { z } from 'zod'

import { listingTypes, toyStatuses } from '../../constants/domain'
import { enumParam, objectIdParam, searchParam } from '../../schemas/list-params'

// Filters of the queue read from the URL (?status=…&listingType=…). Unknown or broken values fall
// back to the defaults instead of breaking the page.
export const queueFiltersSchema = z.object({
  status: z.enum(toyStatuses).catch('pending'),
  listingType: enumParam(listingTypes),
  categoryId: objectIdParam,
  q: searchParam,
})

export type QueueFilters = z.infer<typeof queueFiltersSchema>

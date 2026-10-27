import type { ListingType } from '../../constants/domain'
import { formatMoney } from '../../utils/format'
import type { ToyPricing } from './types'

// One-line price of a post: rent per day and deposit, sale price, or free for a donation.
export const formatToyPrice = (listingType: ListingType, pricing: ToyPricing): string => {
  if (listingType === 'rent') {
    return `${formatMoney(pricing.priceOrRate)}/ngày · cọc ${formatMoney(pricing.depositPrice)}`
  }
  if (listingType === 'sell') return formatMoney(pricing.priceOrRate)
  return 'Tặng miễn phí'
}

// The queue passes its query string (tab, filters, page) to the detail page, so "back to the
// queue" after a decision returns to the same tab and filters.
export const toQueueLinkState = (search: string) => ({ queueSearch: search })

export const queuePathFrom = (state: unknown, basePath: string): string => {
  const search =
    typeof state === 'object' && state !== null && 'queueSearch' in state ? state.queueSearch : ''
  return typeof search === 'string' && search.startsWith('?') ? `${basePath}${search}` : basePath
}

import { formatVnd } from '../toy-listings/format-vnd'
import type { AdvisorFilters, AdvisorHistoryItem, AdvisorListingType, AdvisorToy } from './ai-chat-api'

export const EMPTY_ADVISOR_FILTERS: AdvisorFilters = {
  ageYears: null,
  category: 'any',
  listingType: 'any',
  maxPrice: null,
  area: '',
}

/** Nút lọc nhanh: mỗi lựa chọn tuổi là một số tuổi cụ thể (server lọc theo khoảng tuổi của tin) */
export const ADVISOR_AGE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Dưới 1 tuổi' },
  ...[1, 2, 3, 4, 5, 6].map((age) => ({ value: age, label: `${age} tuổi` })),
  { value: 8, label: '7–9 tuổi' },
  { value: 10, label: 'Từ 10 tuổi' },
]

export const ADVISOR_LISTING_OPTIONS: {
  value: AdvisorListingType
  label: string
}[] = [
  { value: 'any', label: 'Tất cả' },
  { value: 'rent', label: 'Thuê' },
  { value: 'sell', label: 'Mua' },
]

export const ADVISOR_PRICE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Mọi mức giá' },
  { value: 50_000, label: 'Dưới 50k' },
  { value: 100_000, label: 'Dưới 100k' },
  { value: 200_000, label: 'Dưới 200k' },
  { value: 500_000, label: 'Dưới 500k' },
]

const HISTORY_ITEMS = 2
const HISTORY_CHARS = 300

/** Tối ưu token: chỉ gửi 2 tin gần nhất, mỗi tin tối đa 300 ký tự; bỏ các tin báo lỗi */
export function toAdvisorHistory(
  messages: readonly {
    role: 'user' | 'assistant'
    text: string
    isError?: boolean
  }[],
): AdvisorHistoryItem[] {
  return messages
    .filter((message) => !message.isError)
    .slice(-HISTORY_ITEMS)
    .map(({ role, text }) => ({ role, text: text.slice(0, HISTORY_CHARS) }))
}

/** "Lọc: 4 tuổi · Lắp ráp & xếp hình · Thuê · Dưới 100.000 ₫": hiện thành tin của phụ huynh */
export function describeFilters(filters: AdvisorFilters, categories: readonly { slug: string; name: string }[]) {
  const parts = [
    filters.ageYears === null
      ? null
      : (ADVISOR_AGE_OPTIONS.find((option) => option.value === filters.ageYears)?.label ?? `${filters.ageYears} tuổi`),
    categories.find((category) => category.slug === filters.category)?.name ?? null,
    filters.listingType === 'any'
      ? null
      : (ADVISOR_LISTING_OPTIONS.find((option) => option.value === filters.listingType)?.label ?? null),
    filters.maxPrice === null ? null : `Dưới ${formatVnd(filters.maxPrice)}`,
  ].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? `Lọc: ${parts.join(' · ')}` : 'Lọc: tất cả đồ chơi'
}

/** Giá trên thẻ gợi ý: tin thuê tính theo ngày */
export function advisorPriceLabel(toy: Pick<AdvisorToy, 'listingType' | 'priceOrRate'>): string {
  return toy.listingType === 'rent' ? `${formatVnd(toy.priceOrRate)}/ngày` : formatVnd(toy.priceOrRate)
}

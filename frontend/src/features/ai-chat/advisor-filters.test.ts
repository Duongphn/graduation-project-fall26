import { describe, expect, it } from 'vitest'

import { EMPTY_ADVISOR_FILTERS, advisorPriceLabel, describeFilters, toAdvisorHistory } from './advisor-filters'

// Intl.NumberFormat đặt khoảng trắng không ngắt (U+00A0) trước "₫"
const NBSP = String.fromCharCode(0xa0)
const nbsp = (text: string) => text.replaceAll(NBSP, ' ')

describe('toAdvisorHistory', () => {
  it('keeps the 2 latest non-error messages, cut to 300 characters', () => {
    const history = toAdvisorHistory([
      { role: 'user', text: 'một' },
      { role: 'assistant', text: 'hai' },
      { role: 'user', text: 'ba' },
      { role: 'assistant', text: 'y'.repeat(500) },
      { role: 'assistant', text: 'Lỗi mạng', isError: true },
    ])

    expect(history).toEqual([
      { role: 'user', text: 'ba' },
      { role: 'assistant', text: 'y'.repeat(300) },
    ])
  })
})

describe('describeFilters', () => {
  it('names each chosen filter', () => {
    const label = describeFilters(
      {
        ageYears: 4,
        category: 'lap-rap-xep-hinh',
        listingType: 'rent',
        maxPrice: 100_000,
        area: '',
      },
      [{ slug: 'lap-rap-xep-hinh', name: 'Lắp ráp & xếp hình' }],
    )

    expect(nbsp(label)).toBe('Lọc: 4 tuổi · Lắp ráp & xếp hình · Thuê · Dưới 100.000 ₫')
  })

  it('says "all toys" when nothing is chosen', () => {
    expect(describeFilters(EMPTY_ADVISOR_FILTERS, [])).toBe('Lọc: tất cả đồ chơi')
  })
})

describe('advisorPriceLabel', () => {
  it('shows rent per day and the sale price', () => {
    expect(nbsp(advisorPriceLabel({ listingType: 'rent', priceOrRate: 40_000 }))).toBe('40.000 ₫/ngày')
    expect(nbsp(advisorPriceLabel({ listingType: 'sell', priceOrRate: 120_000 }))).toBe('120.000 ₫')
  })
})

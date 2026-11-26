import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { CatalogFilters } from '../toy-catalog-api'
import { FilterPanel } from './filter-panel'

const PRICE_RANGE_ERROR = 'Giá "Từ" phải nhỏ hơn hoặc bằng giá "Đến".'

// Rental scale: the sliders step by 5.000 ₫, so every price below is on a step and jsdom lets the form submit.
const renderPanel = (filters: CatalogFilters = { type: 'rent', page: 1 }) => {
  const onApply = vi.fn()
  render(<FilterPanel filters={filters} categories={[]} onApply={onApply} />)
  return { onApply, user: userEvent.setup() }
}

const fromInput = () => screen.getByRole('textbox', { name: 'Giá từ' })
const toInput = () => screen.getByRole('textbox', { name: 'Giá đến' })
const applyButton = () => screen.getByRole('button', { name: 'Áp dụng bộ lọc' })

describe('FilterPanel price range (R03 2.1.1 (3))', () => {
  it('shows an error and applies nothing when "Từ" is greater than "Đến"', async () => {
    const { onApply, user } = renderPanel()

    await user.type(fromInput(), '50000')
    await user.type(toInput(), '10000')
    await user.click(applyButton())

    expect(screen.getByRole('alert')).toHaveTextContent(PRICE_RANGE_ERROR)
    expect(fromInput()).toHaveAttribute('aria-invalid', 'true')
    expect(toInput()).toHaveAttribute('aria-invalid', 'true')
    expect(onApply).not.toHaveBeenCalled()
  })

  it('applies the range once "Từ" is at most "Đến", and the error goes away', async () => {
    const { onApply, user } = renderPanel()

    await user.type(fromInput(), '50000')
    await user.type(toInput(), '10000')
    await user.click(applyButton())
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.clear(toInput())
    await user.type(toInput(), '50000')
    expect(screen.queryByText(PRICE_RANGE_ERROR)).not.toBeInTheDocument()
    await user.click(applyButton())

    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({ minPrice: 50_000, maxPrice: 50_000 })
  })

  it('applies an ordered range as typed, with no error before "Áp dụng"', async () => {
    const { onApply, user } = renderPanel()

    await user.type(fromInput(), '30000')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.type(toInput(), '40000')
    await user.click(applyButton())

    expect(onApply.mock.calls[0]?.[0]).toMatchObject({ minPrice: 30_000, maxPrice: 40_000 })
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { CatalogFilters } from '../toy-catalog-api'
import { FilterPanel } from './filter-panel'

const PRICE_RANGE_ERROR = 'Giá "Từ" phải nhỏ hơn hoặc bằng giá "Đến".'

const renderPanel = (filters: CatalogFilters = { type: 'rent', page: 1 }) => {
  const onChange = vi.fn()
  render(<FilterPanel filters={filters} categories={[]} onChange={onChange} />)
  return { onChange, user: userEvent.setup() }
}

const fromInput = () => screen.getByRole('textbox', { name: 'Giá từ' })
const toInput = () => screen.getByRole('textbox', { name: 'Giá đến' })
const applyButton = () => screen.getByRole('button', { name: 'Áp dụng' })

describe('FilterPanel price range (R03 2.1.1 (3))', () => {
  it('shows an error and applies nothing when "Từ" is greater than "Đến"', async () => {
    const { onChange, user } = renderPanel()

    await user.type(fromInput(), '50000')
    await user.type(toInput(), '10000')
    await user.click(applyButton())

    expect(screen.getByRole('alert')).toHaveTextContent(PRICE_RANGE_ERROR)
    expect(fromInput()).toHaveAttribute('aria-invalid', 'true')
    expect(toInput()).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('applies the range once "Từ" is at most "Đến", and the error goes away', async () => {
    const { onChange, user } = renderPanel()

    await user.type(fromInput(), '50000')
    await user.type(toInput(), '10000')
    await user.click(applyButton())
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.clear(toInput())
    await user.type(toInput(), '50000')
    expect(screen.queryByText(PRICE_RANGE_ERROR)).not.toBeInTheDocument()
    await user.click(applyButton())

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ minPrice: 50_000, maxPrice: 50_000 })
  })

  it('applies an ordered range with Enter, with no error before applying', async () => {
    const { onChange, user } = renderPanel()

    await user.type(fromInput(), '30000')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.type(toInput(), '40000{Enter}')

    expect(onChange).toHaveBeenCalledWith({ minPrice: 30_000, maxPrice: 40_000 })
  })
})

describe('FilterPanel quick price presets', () => {
  it('applies a rental preset at once, and a second tap clears it', async () => {
    const { onChange, user } = renderPanel()

    await user.click(screen.getByRole('button', { name: '20.000 – 50.000 ₫' }))
    expect(onChange).toHaveBeenLastCalledWith({ minPrice: 20_000, maxPrice: 50_000 })
  })

  it('marks the preset matching the URL as pressed and clears it on tap', async () => {
    const { onChange, user } = renderPanel({ type: 'rent', page: 1, maxPrice: 20_000 })

    const preset = screen.getByRole('button', { name: 'Dưới 20.000 ₫' })
    expect(preset).toHaveAttribute('aria-pressed', 'true')
    await user.click(preset)
    expect(onChange).toHaveBeenLastCalledWith({ minPrice: undefined, maxPrice: undefined })
  })

  it('offers no presets until a listing type is chosen (rent per day and sale prices differ)', () => {
    renderPanel({ page: 1 })
    expect(screen.queryByRole('button', { name: /Dưới/ })).not.toBeInTheDocument()
    expect(screen.getByText(/để có mức giá gợi ý/)).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { PATHS } from '../../../routes/paths'
import type { CatalogFilters } from '../toy-catalog-api'
import { AgeChips, TypeSwitch } from './quick-filters'

describe('AgeChips ("Bé mấy tuổi?")', () => {
  it('applies an age range on one tap', async () => {
    const onChange = vi.fn()
    render(<AgeChips filters={{ page: 1 }} onChange={onChange} />)

    await userEvent.setup().click(screen.getByRole('button', { name: '3–6 tuổi' }))
    expect(onChange).toHaveBeenCalledWith({ ageMin: 3, ageMax: 6 })
  })

  it('marks the chosen age and clears it on a second tap', async () => {
    const onChange = vi.fn()
    render(<AgeChips filters={{ page: 1, ageMin: 1, ageMax: 3 }} onChange={onChange} />)

    const chip = screen.getByRole('button', { name: '1–3 tuổi' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.setup().click(chip)
    expect(onChange).toHaveBeenCalledWith({ ageMin: undefined, ageMax: undefined })
  })
})

describe('TypeSwitch', () => {
  const renderSwitch = (filters: CatalogFilters) =>
    render(
      <MemoryRouter>
        <TypeSwitch filters={filters} />
      </MemoryRouter>,
    )

  it('keeps other filters but drops the price range when switching type', () => {
    renderSwitch({ page: 3, type: 'sell', ageMin: 3, ageMax: 6, minPrice: 200_000 })

    expect(screen.getByRole('link', { name: 'Mua lại' })).toHaveAttribute('aria-current', 'page')
    const rent = screen.getByRole('link', { name: 'Thuê theo ngày' }).getAttribute('href') ?? ''
    const params = new URLSearchParams(rent.split('?')[1])
    expect(params.get('type')).toBe('rent')
    expect(params.get('ageMin')).toBe('3')
    expect(params.has('minPrice')).toBe(false)
    expect(params.has('page')).toBe(false)
  })

  it('sends "Đồ tặng" to the donated toys on the home page', () => {
    renderSwitch({ page: 1 })
    expect(screen.getByRole('link', { name: 'Đồ tặng' })).toHaveAttribute('href', PATHS.donations)
  })
})

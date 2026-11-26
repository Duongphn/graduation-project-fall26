import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { ToyCard as ToyCardData } from '../toy-catalog-api'
import { ToyCard } from './toy-card'

const base: ToyCardData = {
  id: '64c000000000000000000001',
  title: 'Bộ xếp hình gỗ',
  primaryImage: null,
  listingType: 'rent',
  priceOrRate: 20_000,
  depositPrice: 300_000,
  category: { id: '64b000000000000000000001', name: 'Đồ chơi gỗ', slug: 'do-choi-go' },
  ageRange: { minAge: 3, maxAge: 6 },
  condition: 'Như mới (90–99%)',
  createdAt: '2026-11-01T00:00:00.000Z',
}

const renderCard = (toy: ToyCardData, distanceKm?: number) =>
  render(
    <MemoryRouter>
      <ToyCard toy={toy} index={0} distanceKm={distanceKm} />
    </MemoryRouter>,
  )

describe('ToyCard (danh sách /toys, Đồ chơi cùng danh mục)', () => {
  it('labels a donated toy "Quyên góp" and "Miễn phí", never "Bán lại 0 ₫"', () => {
    renderCard({ ...base, listingType: 'donate', priceOrRate: 0, depositPrice: null })

    expect(screen.getByText('Quyên góp')).toBeInTheDocument()
    expect(screen.getByText('Miễn phí')).toBeInTheDocument()
    expect(screen.queryByText('Bán lại')).not.toBeInTheDocument()
    expect(screen.queryByText(/0\s*₫/)).not.toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveClass('catalog-card--donate')
  })

  it('shows the daily rate and the deposit, refunded on return, for a rental', () => {
    renderCard(base)
    expect(screen.getByText('Cho thuê')).toBeInTheDocument()
    expect(screen.getByText('/ngày')).toBeInTheDocument()
    expect(screen.getByText(/Cọc/)).toHaveTextContent('Cọc 300.000')
    expect(screen.getByText('hoàn khi trả')).toBeInTheDocument()
  })

  it('says so when a rental needs no deposit', () => {
    renderCard({ ...base, depositPrice: 0 })
    expect(screen.getByText('Không cần đặt cọc')).toBeInTheDocument()
  })

  it('keeps the sale label and price, with no deposit line', () => {
    renderCard({ ...base, listingType: 'sell', priceOrRate: 250_000, depositPrice: null })
    expect(screen.getByText('Bán lại')).toBeInTheDocument()
    expect(screen.getByText(/250\.000/)).toBeInTheDocument()
    expect(screen.queryByText(/^Cọc/)).not.toBeInTheDocument()
    expect(screen.queryByText('Miễn phí')).not.toBeInTheDocument()
  })

  it('reads the condition as a level with its full text for screen readers', () => {
    renderCard(base)
    expect(screen.getByText('Tình trạng: Như mới (90–99%)')).toBeInTheDocument()
    expect(document.querySelector('.condition')).toHaveAttribute('data-level', '3')
    expect(document.querySelectorAll('.condition__bars i.is-on')).toHaveLength(3)
  })

  it('shows a free-text condition without a level', () => {
    renderCard({ ...base, condition: 'Còn chơi tốt' })
    expect(document.querySelector('.condition')).not.toHaveAttribute('data-level')
    expect(document.querySelector('.condition__bars')).toBeNull()
  })

  it('shows the distance on the photo when filtering near me', () => {
    renderCard(base, 2.44)
    expect(screen.getByText('Cách 2,4 km')).toBeInTheDocument()
  })
})

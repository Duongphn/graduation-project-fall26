import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { purchaseApi, type PurchaseOrder } from '../features/purchases/purchase-api'
import { PurchaseOrdersPage } from './purchase-orders-page'

const order: PurchaseOrder = {
  id: 'o1',
  code: 'PO261121-AB12C',
  buyerId: 'buyer-1',
  sellerId: 'seller-1',
  toyId: 't1',
  itemDetails: { title: 'LEGO Duplo xe lửa số học' },
  deliveryMethod: 'DELIVERY',
  pricing: { itemPrice: 350_000, shippingFee: 30_000, platformFee: 17_500, totalPayable: 380_000, sellerNet: 332_500 },
  status: 'PAID',
  createdAt: '2026-11-21T03:00:00.000Z',
}

const renderAs = (role: 'buyer' | 'seller') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <PurchaseOrdersPage role={role} />
      </MemoryRouter>
    </QueryClientProvider>,
  )

const page = (items: PurchaseOrder[]) => ({
  items,
  pagination: { page: 1, limit: 10, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPrevPage: false },
})

describe('PurchaseOrdersPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists sales with what the seller receives and the next step', async () => {
    const list = vi.spyOn(purchaseApi, 'list').mockResolvedValue(page([order]))
    renderAs('seller')

    expect(await screen.findByText('LEGO Duplo xe lửa số học')).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith('seller', 1, 10)
    expect(screen.getByText('→ Cần gửi hàng')).toBeInTheDocument()
    expect(screen.getByText(/332\.500/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Đơn bán' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('link', { name: /LEGO Duplo/ })).toHaveAttribute('href', '/purchases/o1')
  })

  it('shows what the buyer paid and an empty state', async () => {
    vi.spyOn(purchaseApi, 'list').mockResolvedValueOnce(page([order]))
    renderAs('buyer')
    expect(await screen.findByText(/380\.000/)).toBeInTheDocument()
    expect(screen.queryByText('→ Cần gửi hàng')).not.toBeInTheDocument()
  })

  it('invites a buyer with no order to browse toys for sale', async () => {
    vi.spyOn(purchaseApi, 'list').mockResolvedValue(page([]))
    renderAs('buyer')
    expect(await screen.findByText('Bạn chưa mua món nào.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tìm đồ chơi đang bán' })).toHaveAttribute('href', '/toys?type=sell')
  })
})

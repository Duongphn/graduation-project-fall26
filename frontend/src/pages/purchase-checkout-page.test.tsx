import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { purchaseApi, type PurchaseOrder, type PurchaseQuote } from '../features/purchases/purchase-api'
import { ApiError } from '../services/api-error'
import { PurchaseCheckoutPage } from './purchase-checkout-page'

const quote = (overrides: Partial<PurchaseQuote> = {}): PurchaseQuote => ({
  toyId: 't1',
  title: 'LEGO Duplo xe lửa số học',
  sellerId: 'seller-1',
  sellerName: 'Mẹ Bảo Anh',
  deliveryMethod: 'DELIVERY',
  itemPrice: 350_000,
  shippingFee: 30_000,
  platformFee: 17_500,
  totalPayable: 380_000,
  sellerNet: 362_500,
  ...overrides,
})

const renderPage = (balance = 1_000_000) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Hồ sơ và ví đã có trong cache (trang chỉ đọc)
  client.setQueryData(['profile'], {
    id: 'buyer-1',
    fullName: 'Vương Giang Trường',
    email: 'a@b.c',
    phone: '0901234567',
    verificationStatus: 'verified',
    role: 'USER',
    address: { province: 'Hà Nội', district: '', ward: 'Phường Cầu Giấy', street: '1 Trần Thái Tông' },
  })
  client.setQueryData(['wallet', 'me'], { balance, availableBalance: balance, holdingBalance: 0, currency: 'VND' })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/toys/t1/buy']}>
        <Routes>
          <Route path="/toys/:toyId/buy" element={<PurchaseCheckoutPage />} />
          <Route path="/purchases/:orderId" element={<p>Trang đơn hàng</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PurchaseCheckoutPage', () => {
  beforeEach(() => {
    localStorage.setItem('toyflow-user', JSON.stringify({ id: 'buyer-1', fullName: 'Vương Giang Trường' }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows the price with the delivery fee and pre-fills the address from the profile', async () => {
    vi.spyOn(purchaseApi, 'quote').mockResolvedValue(quote())
    renderPage()

    const summary = await screen.findByRole('region', { name: 'Đơn hàng' })
    expect(await within(summary).findByText('LEGO Duplo xe lửa số học')).toBeInTheDocument()
    expect(within(summary).getByText('Tổng thanh toán').nextElementSibling).toHaveTextContent('380.000')
    expect(screen.getByLabelText('Họ tên người nhận')).toHaveValue('Vương Giang Trường')
    expect(screen.getByLabelText('Phường/Xã')).toHaveValue('Phường Cầu Giấy')
  })

  it('switches to local pickup: no address and a new quote without the delivery fee', async () => {
    const quoteApi = vi
      .spyOn(purchaseApi, 'quote')
      .mockImplementation(async (_toyId, method) =>
        method === 'LOCAL_PICKUP' ? quote({ deliveryMethod: 'LOCAL_PICKUP', shippingFee: 0, totalPayable: 350_000 }) : quote(),
      )
    renderPage()

    await userEvent.click(await screen.findByRole('radio', { name: /Tự đến lấy/ }))

    expect(quoteApi).toHaveBeenLastCalledWith('t1', 'LOCAL_PICKUP')
    expect(screen.queryByLabelText('Họ tên người nhận')).not.toBeInTheDocument()
    expect(await screen.findByText('Miễn phí')).toBeInTheDocument()
  })

  it('pays from the wallet after confirming and opens the new order', async () => {
    vi.spyOn(purchaseApi, 'quote').mockResolvedValue(quote())
    const buyNow = vi.spyOn(purchaseApi, 'buyNow').mockResolvedValue({ id: 'o1' } as PurchaseOrder)
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Thanh toán 380\.000/ }))
    const dialog = screen.getByRole('dialog', { name: 'Xác nhận thanh toán' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thanh toán' }))

    expect(buyNow).toHaveBeenCalledWith(
      expect.objectContaining({ toyId: 't1', deliveryMethod: 'DELIVERY', recipientName: 'Vương Giang Trường', ward: 'Phường Cầu Giấy' }),
    )
    expect(await screen.findByText('Trang đơn hàng')).toBeInTheDocument()
  })

  it('blocks paying with a missing address', async () => {
    vi.spyOn(purchaseApi, 'quote').mockResolvedValue(quote())
    const buyNow = vi.spyOn(purchaseApi, 'buyNow')
    renderPage()

    await userEvent.clear(await screen.findByLabelText('Số nhà, tên đường'))
    await userEvent.click(screen.getByRole('button', { name: /Thanh toán 380\.000/ }))

    expect(screen.getByText('Vui lòng nhập số nhà, tên đường.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(buyNow).not.toHaveBeenCalled()
  })

  it('shows the shortfall with a top-up link and disables paying', async () => {
    vi.spyOn(purchaseApi, 'quote').mockResolvedValue(quote())
    renderPage(100_000)

    expect(await screen.findByText(/Ví còn thiếu/)).toHaveTextContent('280.000')
    expect(screen.getByRole('link', { name: /Nạp tiền vào ví/ })).toHaveAttribute(
      'href',
      '/wallet?topup=280000&returnTo=%2Ftoys%2Ft1%2Fbuy',
    )
    expect(screen.getByRole('button', { name: /Thanh toán 380\.000/ })).toBeDisabled()
  })

  it('does not let the seller buy their own toy', async () => {
    vi.spyOn(purchaseApi, 'quote').mockResolvedValue(quote({ sellerId: 'buyer-1' }))
    renderPage()

    expect(await screen.findByText('Đây là tin của bạn nên không thể tự mua.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thanh toán 380\.000/ })).toBeDisabled()
  })

  it('explains when someone else bought it first', async () => {
    vi.spyOn(purchaseApi, 'quote').mockResolvedValue(quote())
    vi.spyOn(purchaseApi, 'buyNow').mockRejectedValue(
      new ApiError(409, 'TOY_ALREADY_SOLD', 'Món đồ chơi này đã có người đặt mua trước hoặc không còn khả dụng.'),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /Thanh toán 380\.000/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Thanh toán' }))

    expect(await screen.findByText('Món đồ chơi này không còn mua được.')).toBeInTheDocument()
    expect(screen.getByText(/đã có người đặt mua trước/)).toBeInTheDocument()
  })
})

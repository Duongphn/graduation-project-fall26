import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../services/api-error'
import * as session from '../topup-session'
import { walletApi } from '../wallet-api'
import { TopupDialog } from './topup-dialog'

const renderDialog = (props: Partial<Parameters<typeof TopupDialog>[0]> = {}) => {
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/wallet']}>
        <Routes>
          <Route path="/wallet" element={<TopupDialog onClose={onClose} {...props} />} />
          <Route path="/wallet/topup/payos/:code" element={<p>Trang mã QR</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onClose }
}

describe('TopupDialog', () => {
  let gateway: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    gateway = vi.spyOn(session, 'goToPaymentGateway').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('starts on PayOS (bank transfer QR) and opens ToyFlow’s own QR page', async () => {
    const createPayosTopup = vi.spyOn(walletApi, 'createPayosTopup').mockResolvedValue({
      checkoutUrl: 'https://pay.payos.vn/web/1763600000123',
      qrCode: '000201010212',
      paymentCode: '1763600000123',
      amount: 100_000,
      status: 'pending',
      expiresAt: '2026-11-20T10:15:00.000Z',
      bankBin: '970422',
      accountNumber: 'VQRQANTED5398',
      accountName: 'LE VU CUONG',
      description: 'NAP VI 1763600000123',
    })
    const createTopup = vi.spyOn(walletApi, 'createTopup')
    renderDialog()

    expect(screen.getByRole('radio', { name: /Chuyển khoản QR/ })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: /100\.000/ }))
    await userEvent.click(screen.getByRole('button', { name: /qua PayOS/ }))

    expect(createPayosTopup).toHaveBeenCalledWith(100_000)
    expect(createTopup).not.toHaveBeenCalled()
    // Stays inside ToyFlow
    expect(await screen.findByText('Trang mã QR')).toBeInTheDocument()
    expect(gateway).not.toHaveBeenCalled()
  })

  it('creates a pending top-up and sends the user to VNPay', async () => {
    const createTopup = vi.spyOn(walletApi, 'createTopup').mockResolvedValue({
      paymentCode: 'TOPUP1',
      paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=TOPUP1',
      amount: 200_000,
    })
    renderDialog({ returnTo: '/rentals/mine/1' })

    await userEvent.click(screen.getByRole('radio', { name: /Thẻ ngân hàng/ }))
    await userEvent.click(screen.getByRole('button', { name: /200\.000/ }))
    await userEvent.click(screen.getByRole('button', { name: /qua VNPay/ }))

    expect(createTopup).toHaveBeenCalledWith(200_000)
    expect(gateway).toHaveBeenCalledWith('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=TOPUP1')
    expect(session.readTopupReturn()).toBe('/rentals/mine/1')
  })

  it('formats the typed amount and blocks amounts outside the limits', async () => {
    const createTopup = vi.spyOn(walletApi, 'createTopup')
    renderDialog()

    const input = screen.getByLabelText('Số tiền nạp')
    await userEvent.type(input, '5000')
    expect(input).toHaveValue('5.000')

    await userEvent.click(screen.getByRole('button', { name: /Tiếp tục với/ }))
    expect(screen.getByText(/tối thiểu/)).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(createTopup).not.toHaveBeenCalled()
  })

  it('starts from the suggested amount', () => {
    renderDialog({ initialAmount: 124_000 })
    expect(screen.getByLabelText('Số tiền nạp')).toHaveValue('124.000')
  })

  it('shows the server error and stays open', async () => {
    vi.spyOn(walletApi, 'createPayosTopup').mockRejectedValue(
      new ApiError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED', 'Cổng PayOS chưa được cấu hình.'),
    )
    renderDialog({ initialAmount: 100_000 })

    await userEvent.click(screen.getByRole('button', { name: /qua PayOS/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Cổng PayOS chưa được cấu hình.')
    expect(gateway).not.toHaveBeenCalled()
  })

  it('closes with Escape', async () => {
    const { onClose } = renderDialog()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

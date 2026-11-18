import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      <TopupDialog onClose={onClose} {...props} />
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

  it('creates a pending top-up and sends the user to VNPay', async () => {
    const createTopup = vi.spyOn(walletApi, 'createTopup').mockResolvedValue({
      paymentCode: 'TOPUP1',
      paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=TOPUP1',
      amount: 200_000,
      expiresAt: '2026-11-18T17:15:00.000Z',
    })
    renderDialog({ returnTo: '/rentals/mine/1' })

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

    await userEvent.click(screen.getByRole('button', { name: /VNPay/ }))
    expect(screen.getByText(/tối thiểu/)).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(createTopup).not.toHaveBeenCalled()
  })

  it('starts from the suggested amount', () => {
    renderDialog({ initialAmount: 124_000 })
    expect(screen.getByLabelText('Số tiền nạp')).toHaveValue('124.000')
  })

  it('shows the server error and stays open', async () => {
    vi.spyOn(walletApi, 'createTopup').mockRejectedValue(
      new ApiError(503, 'PAYMENT_GATEWAY_UNAVAILABLE', 'Cổng VNPay chưa được cấu hình.'),
    )
    renderDialog({ initialAmount: 100_000 })

    await userEvent.click(screen.getByRole('button', { name: /qua VNPay/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Cổng VNPay chưa được cấu hình.')
    expect(gateway).not.toHaveBeenCalled()
  })

  it('closes with Escape', async () => {
    const { onClose } = renderDialog()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

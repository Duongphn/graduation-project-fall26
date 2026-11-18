import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { rememberTopupReturn } from '../features/wallet/topup-session'
import { walletApi, type TopupResult } from '../features/wallet/wallet-api'
import { WalletTopupResultPage } from './wallet-topup-result-page'

const VNPAY_QUERY = '?vnp_Amount=20000000&vnp_ResponseCode=00&vnp_TxnRef=TOPUP1&vnp_SecureHash=abc'

const renderAt = (url: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <WalletTopupResultPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { invalidate }
}

const result = (overrides: Partial<TopupResult>): TopupResult => ({
  paymentCode: 'TOPUP1',
  amount: 200_000,
  status: 'success',
  cancelled: false,
  balance: 450_000,
  ...overrides,
})

describe('WalletTopupResultPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('sends the raw VNPay query to the server and shows the credited amount', async () => {
    const confirm = vi.spyOn(walletApi, 'confirmVnpayReturn').mockResolvedValue(result({}))
    rememberTopupReturn('/rentals/mine/1')
    const { invalidate } = renderAt(`/wallet/topup/result${VNPAY_QUERY}`)

    expect(await screen.findByRole('heading', { name: /Đã nạp 200\.000/ })).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith(VNPAY_QUERY)
    expect(screen.getByRole('link', { name: 'Quay lại thanh toán đơn thuê' })).toHaveAttribute(
      'href',
      '/rentals/mine/1',
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wallet', 'me'] })
  })

  it('tells the user they cancelled, without a way back to pay', async () => {
    vi.spyOn(walletApi, 'confirmVnpayReturn').mockResolvedValue(result({ status: 'failed', cancelled: true }))
    rememberTopupReturn('/rentals/mine/1')
    renderAt(`/wallet/topup/result${VNPAY_QUERY}`)

    expect(await screen.findByRole('heading', { name: 'Bạn đã huỷ giao dịch nạp tiền' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Quay lại thanh toán đơn thuê' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về ví ToyFlow' })).toBeInTheDocument()
  })

  it('shows a failed payment and a pending one with a retry button', async () => {
    vi.spyOn(walletApi, 'confirmVnpayReturn').mockResolvedValue(result({ status: 'pending' }))
    renderAt(`/wallet/topup/result${VNPAY_QUERY}`)

    expect(await screen.findByRole('heading', { name: 'Giao dịch đang được xử lý' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kiểm tra lại' })).toBeInTheDocument()
  })

  it('does not call the server without VNPay parameters', () => {
    const confirm = vi.spyOn(walletApi, 'confirmVnpayReturn')
    renderAt('/wallet/topup/result')

    expect(screen.getByRole('heading', { name: 'Không tìm thấy giao dịch' })).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })
})

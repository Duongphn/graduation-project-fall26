import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../contexts/theme-provider'
import { rememberTopupReturn } from '../features/wallet/topup-session'
import { walletApi, type TopupResult } from '../features/wallet/wallet-api'
import { WalletTopupResultPage } from './wallet-topup-result-page'

const VNPAY_QUERY = '?vnp_Amount=20000000&vnp_ResponseCode=00&vnp_TxnRef=TOPUP1&vnp_SecureHash=abc'

const renderAt = (url: string, gateway: 'vnpay' | 'payos' = 'vnpay') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    // AccountLayout có nút đổi giao diện (cần ThemeProvider như ở main.tsx)
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[url]}>
          <WalletTopupResultPage gateway={gateway} />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  )
  return { invalidate }
}

// Same shape as the lead's GET /payments/vnpay-return
const result = (overrides: Partial<TopupResult>): TopupResult => ({
  success: true,
  status: 'success',
  paymentCode: 'TOPUP1',
  amount: 200_000,
  message: 'Nạp tiền vào ví thành công.',
  ...overrides,
})

describe('WalletTopupResultPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('sends the raw VNPay query, shows the credited amount and the new balance', async () => {
    const confirm = vi.spyOn(walletApi, 'confirmVnpayReturn').mockResolvedValue(result({}))
    vi.spyOn(walletApi, 'me').mockResolvedValue({
      balance: 450_000,
      availableBalance: 450_000,
      holdingBalance: 0,
      currency: 'VND',
    })
    rememberTopupReturn('/rentals/mine/1')
    const { invalidate } = renderAt(`/wallet/topup/result${VNPAY_QUERY}`)

    expect(await screen.findByRole('heading', { name: /Đã nạp 200\.000/ })).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith(VNPAY_QUERY)
    expect(await screen.findByText(/Số dư khả dụng hiện tại: 450\.000/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Quay lại thanh toán đơn thuê' })).toHaveAttribute(
      'href',
      '/rentals/mine/1',
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wallet', 'me'] })
  })

  it('tells the user they cancelled, without a way back to pay', async () => {
    vi.spyOn(walletApi, 'confirmVnpayReturn').mockResolvedValue(
      result({ success: false, status: 'cancelled', message: 'Giao dịch nạp tiền đã bị hủy bởi người dùng.' }),
    )
    rememberTopupReturn('/rentals/mine/1')
    renderAt(`/wallet/topup/result${VNPAY_QUERY}`)

    expect(await screen.findByRole('heading', { name: 'Bạn đã huỷ giao dịch nạp tiền' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Quay lại thanh toán đơn thuê' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về ví ToyFlow' })).toBeInTheDocument()
  })

  it('shows a failed payment', async () => {
    vi.spyOn(walletApi, 'confirmVnpayReturn').mockResolvedValue(
      result({ success: false, status: 'failed', message: 'Giao dịch nạp tiền thất bại.' }),
    )
    renderAt(`/wallet/topup/result${VNPAY_QUERY}`)

    expect(await screen.findByRole('heading', { name: 'Nạp tiền không thành công' })).toBeInTheDocument()
  })

  it('shows the server message when the signature is invalid', async () => {
    vi.spyOn(walletApi, 'confirmVnpayReturn').mockResolvedValue({
      success: false,
      status: 'invalid_checksum',
      message: 'Chữ ký xác thực không hợp lệ (Checksum failed).',
    })
    renderAt(`/wallet/topup/result${VNPAY_QUERY}`)

    expect(await screen.findByRole('heading', { name: 'Không xác nhận được giao dịch' })).toBeInTheDocument()
    expect(screen.getByText('Chữ ký xác thực không hợp lệ (Checksum failed).')).toBeInTheDocument()
  })

  it('asks the server about a PayOS order and offers a re-check while the transfer is pending', async () => {
    const confirm = vi
      .spyOn(walletApi, 'confirmPayosReturn')
      .mockResolvedValueOnce(result({ success: false, status: 'pending', message: 'Đang chờ xác nhận thanh toán.' }))
      .mockResolvedValueOnce(result({}))
    vi.spyOn(walletApi, 'me').mockResolvedValue({ balance: 200_000, availableBalance: 200_000, holdingBalance: 0, currency: 'VND' })
    renderAt('/wallet/topup/payos-result?code=00&id=abc&cancel=false&status=PAID&orderCode=1763600000123', 'payos')

    expect(await screen.findByRole('heading', { name: 'Đang chờ xác nhận chuyển khoản' })).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledWith('1763600000123')

    await userEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại' }))
    expect(await screen.findByRole('heading', { name: /Đã nạp 200\.000/ })).toBeInTheDocument()
  })

  it('shows a cancelled PayOS payment', async () => {
    vi.spyOn(walletApi, 'confirmPayosReturn').mockResolvedValue(
      result({ success: false, status: 'cancelled', message: 'Giao dịch nạp tiền đã bị hủy bởi người dùng.' }),
    )
    renderAt('/wallet/topup/payos-result?cancel=true&status=CANCELLED&orderCode=1763600000123', 'payos')

    expect(await screen.findByRole('heading', { name: 'Bạn đã huỷ giao dịch nạp tiền' })).toBeInTheDocument()
  })

  it('does not call the server without VNPay parameters', () => {
    const confirm = vi.spyOn(walletApi, 'confirmVnpayReturn')
    renderAt('/wallet/topup/result')

    expect(screen.getByRole('heading', { name: 'Không tìm thấy giao dịch' })).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })
})

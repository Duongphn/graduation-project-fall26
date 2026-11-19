import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { walletApi, type PayosCheckout } from '../features/wallet/wallet-api'
import { WalletPayosCheckoutPage } from './wallet-payos-checkout-page'

const CODE = '1763600000123'

const checkout = (overrides: Partial<PayosCheckout> = {}): PayosCheckout => ({
  paymentCode: CODE,
  amount: 10_000,
  status: 'pending',
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  qrCode: '00020101021238570010A000000727',
  checkoutUrl: `https://pay.payos.vn/web/${CODE}`,
  bankBin: '970422',
  accountNumber: 'VQRQANTED5398',
  accountName: 'LE VU CUONG',
  description: `NAP VI ${CODE}`,
  ...overrides,
})

function ResultProbe() {
  const { pathname, search } = useLocation()
  return <p>Trang kết quả {pathname + search}</p>
}

const renderAt = (url = `/wallet/topup/payos/${CODE}`) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/wallet/topup/payos/:code" element={<WalletPayosCheckoutPage />} />
          <Route path="/wallet/topup/payos-result" element={<ResultProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('WalletPayosCheckoutPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the VietQR and the transfer details in ToyFlow, with copy buttons', async () => {
    vi.spyOn(walletApi, 'getPayosCheckout').mockResolvedValue(checkout())
    vi.spyOn(walletApi, 'confirmPayosReturn').mockResolvedValue({ success: false, status: 'pending', message: '' })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderAt()

    expect(await screen.findByRole('heading', { name: /Chuyển khoản 10\.000/ })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /Mã VietQR chuyển 10\.000/ })).toBeInTheDocument()
    expect(screen.getByText('MB')).toBeInTheDocument()
    expect(screen.getByText('LE VU CUONG')).toBeInTheDocument()
    expect(screen.getByText(`NAP VI ${CODE}`)).toBeInTheDocument()
    expect(screen.getByText(/Còn \d{2}:\d{2}/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Mở trang PayOS/ })).toHaveAttribute('href', `https://pay.payos.vn/web/${CODE}`)

    await userEvent.click(screen.getByRole('button', { name: 'Sao chép nội dung chuyển khoản' }))
    expect(writeText).toHaveBeenCalledWith(`NAP VI ${CODE}`)
    expect(screen.getByRole('button', { name: 'Sao chép nội dung chuyển khoản' })).toHaveTextContent('Đã chép')

    await userEvent.click(screen.getByRole('button', { name: 'Sao chép số tiền' }))
    expect(writeText).toHaveBeenLastCalledWith('10000')
  })

  it('saves the QR as a PNG for phone users', async () => {
    vi.spyOn(walletApi, 'getPayosCheckout').mockResolvedValue(checkout())
    vi.spyOn(walletApi, 'confirmPayosReturn').mockResolvedValue({ success: false, status: 'pending', message: '' })
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
    renderAt()

    await userEvent.click(await screen.findByRole('button', { name: /Lưu ảnh mã QR/ }))

    await vi.waitFor(() => expect(clicked).toHaveLength(1))
    expect(clicked[0]!.download).toBe(`toyflow-nap-vi-${CODE}.png`)
    expect(clicked[0]!.href).toMatch(/^data:image\/png;base64,/)
  })

  it('goes to the result page as soon as the money has arrived', async () => {
    vi.spyOn(walletApi, 'getPayosCheckout').mockResolvedValue(checkout())
    vi.spyOn(walletApi, 'confirmPayosReturn').mockResolvedValue({
      success: true,
      status: 'success',
      paymentCode: CODE,
      amount: 10_000,
      message: '',
    })
    renderAt()

    expect(await screen.findByText(`Trang kết quả /wallet/topup/payos-result?orderCode=${CODE}`)).toBeInTheDocument()
  })

  it('cancels from ToyFlow and shows the result', async () => {
    vi.spyOn(walletApi, 'getPayosCheckout').mockResolvedValue(checkout())
    vi.spyOn(walletApi, 'confirmPayosReturn').mockResolvedValue({ success: false, status: 'pending', message: '' })
    const cancel = vi
      .spyOn(walletApi, 'cancelPayosTopup')
      .mockResolvedValue({ success: false, status: 'cancelled', message: '' })
    renderAt()

    await userEvent.click(await screen.findByRole('button', { name: 'Huỷ giao dịch' }))

    expect(cancel).toHaveBeenCalledWith(CODE)
    expect(await screen.findByText(/Trang kết quả \/wallet\/topup\/payos-result/)).toBeInTheDocument()
  })

  it('hides the QR once the link has expired and offers a new one', async () => {
    vi.spyOn(walletApi, 'getPayosCheckout').mockResolvedValue(
      checkout({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    )
    const confirm = vi.spyOn(walletApi, 'confirmPayosReturn')
    renderAt()

    expect(await screen.findByText('Mã QR đã hết hạn')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Mã VietQR/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tạo mã mới' })).toHaveAttribute('href', '/wallet?topup=10000')
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: /Mở trang PayOS/ })).not.toBeInTheDocument()
    const header = screen.getByRole('heading', { name: /Chuyển khoản/ }).closest('header')!
    expect(within(header).getByText('Đã hết hạn')).toBeInTheDocument()
  })

  it('says when the payment does not exist', async () => {
    renderAt('/wallet/topup/payos/not-a-code')
    expect(await screen.findByText('Không tìm thấy giao dịch nạp tiền.')).toBeInTheDocument()
  })
})

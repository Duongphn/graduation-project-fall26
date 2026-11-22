import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../contexts/theme-provider'
import { purchaseApi, type PurchaseOrder } from '../features/purchases/purchase-api'
import { PurchaseOrderDetailPage } from './purchase-order-detail-page'

const uploadImage = vi.fn()
vi.mock('../services/upload', () => ({
  uploadImage: (...args: unknown[]) => uploadImage(...args),
  UploadTooLargeError: class extends Error {},
}))

const order = (overrides: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'o1',
  code: 'PO261121-AB12C',
  buyerId: 'buyer-1',
  sellerId: 'seller-1',
  toyId: 't1',
  itemDetails: { title: 'LEGO Duplo xe lửa số học', condition: 'Như mới (90–99%)' },
  deliveryMethod: 'DELIVERY',
  deliveryInfo: { recipientName: 'Vương Giang Trường', recipientPhone: '0901234567', province: 'Hà Nội', ward: 'Phường Cầu Giấy', street: '1 Trần Thái Tông' },
  pricing: { itemPrice: 350_000, shippingFee: 30_000, platformFee: 17_500, totalPayable: 380_000, sellerNet: 362_500 },
  status: 'PAID',
  paidAt: '2026-11-21T03:00:00.000Z',
  timer: { dueAt: '2026-11-23T03:00:00.000Z' },
  createdAt: '2026-11-21T03:00:00.000Z',
  ...overrides,
})

const renderAs = (userId: string, data: PurchaseOrder) => {
  localStorage.setItem('toyflow-user', JSON.stringify({ id: userId, fullName: 'X' }))
  vi.spyOn(purchaseApi, 'detail').mockResolvedValue(data)
  render(
    // AccountLayout có nút đổi giao diện (cần ThemeProvider như ở main.tsx)
    <ThemeProvider>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/purchases/o1']}>
          <Routes>
            <Route path="/purchases/:orderId" element={<PurchaseOrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

describe('PurchaseOrderDetailPage', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    uploadImage.mockReset()
    localStorage.clear()
  })

  it('seller of a paid order: uploads the packing photo and ships with the tracking code', async () => {
    uploadImage.mockResolvedValue({ url: 'https://res.cloudinary.com/x/pack.jpg', publicId: 'toyflow/toys/pack' })
    const shipped = order({
      status: 'SHIPPING',
      shippedAt: '2026-11-21T05:00:00.000Z',
      shippingInfo: { carrierName: 'Viettel Post', trackingCode: 'VTP123' },
    })
    const ship = vi.spyOn(purchaseApi, 'ship').mockResolvedValue(shipped)
    renderAs('seller-1', order())

    expect(await screen.findByRole('heading', { name: /Đơn bán PO261121-AB12C/ })).toBeInTheDocument()
    expect(screen.getByText('Bạn sẽ nhận').nextElementSibling).toHaveTextContent('362.500')
    // Người bán tự gửi hàng nên nhận lại phí giao
    expect(screen.getByText('Phí giao hàng').nextElementSibling).toHaveTextContent('+30.000')

    // Missing tracking code and photo
    await userEvent.selectOptions(screen.getByLabelText('Đơn vị vận chuyển'), 'Viettel Post')
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận đã gửi hàng' }))
    expect(screen.getByText('Vui lòng nhập mã vận đơn.')).toBeInTheDocument()
    expect(screen.getByText(/Thêm ít nhất 1 ảnh/)).toBeInTheDocument()
    expect(ship).not.toHaveBeenCalled()

    // The page reloads the order after shipping: the server now returns it as SHIPPING
    vi.mocked(purchaseApi.detail).mockResolvedValue(shipped)
    await userEvent.type(screen.getByLabelText(/Mã vận đơn/), 'VTP123')
    await userEvent.upload(screen.getByLabelText('Chọn ảnh đóng gói'), new File(['x'], 'pack.jpg', { type: 'image/jpeg' }))
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận đã gửi hàng' }))

    expect(uploadImage).toHaveBeenCalledWith(expect.any(File), 'TOY_PHOTO')
    expect(ship).toHaveBeenCalledWith('o1', {
      carrierName: 'Viettel Post',
      trackingCode: 'VTP123',
      photos: [{ url: 'https://res.cloudinary.com/x/pack.jpg', publicId: 'toyflow/toys/pack' }],
      note: undefined,
    })
    expect(await screen.findByText(/Đã gửi hàng. Tiền về ví khi người mua xác nhận/)).toBeInTheDocument()
  })

  it('buyer of a paid order only waits for the seller', async () => {
    renderAs('buyer-1', order())

    expect(await screen.findByText(/Đang chờ người bán gửi hàng \(hạn/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận đã gửi hàng' })).not.toBeInTheDocument()
    expect(screen.getByText('Đã thanh toán (ký quỹ)')).toBeInTheDocument()
  })

  it('buyer of a shipped order: confirms receipt after ticking the check', async () => {
    const completed = order({ status: 'COMPLETED', completedAt: '2026-11-22T03:00:00.000Z' })
    const receive = vi.spyOn(purchaseApi, 'receive').mockResolvedValue(completed)
    renderAs(
      'buyer-1',
      order({
        status: 'SHIPPING',
        shippedAt: '2026-11-21T05:00:00.000Z',
        shippingInfo: { carrierName: 'Viettel Post', trackingCode: 'VTP123', photos: [{ url: 'https://res.cloudinary.com/x/pack.jpg' }] },
      }),
    )

    expect(await screen.findByText('VTP123')).toBeInTheDocument()
    expect(screen.getByText(/đơn tự hoàn tất lúc/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ảnh đóng gói 1' })).toBeInTheDocument()
    const confirmButton = screen.getByRole('button', { name: 'Đã nhận & hài lòng' })
    expect(confirmButton).toBeDisabled()

    vi.mocked(purchaseApi.detail).mockResolvedValue(completed)
    await userEvent.click(screen.getByLabelText(/Tôi đã nhận và kiểm tra/))
    await userEvent.click(confirmButton)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }))

    expect(receive).toHaveBeenCalledWith('o1')
    expect(await screen.findByText(/Đơn đã hoàn tất. Cảm ơn bạn/)).toBeInTheDocument()
  })

  it('buyer of an order the seller did not ship in time sees the refund', async () => {
    renderAs('buyer-1', order({ status: 'CANCELLED', cancelledAt: '2026-11-23T03:05:00.000Z', timer: undefined }))

    expect(await screen.findByText(/ToyFlow đã hoàn toàn bộ tiền vào ví của bạn/)).toBeInTheDocument()
    expect(screen.getByText('Đã huỷ')).toBeInTheDocument()
    expect(screen.getByText(/Huỷ lúc/)).toBeInTheDocument()
    expect(screen.getByText('Đã hoàn vào ví').nextElementSibling).toHaveTextContent('380.000')
    expect(screen.getByRole('link', { name: 'Xem ví' })).toHaveAttribute('href', '/wallet')
    expect(screen.queryByRole('button', { name: 'Đã nhận & hài lòng' })).not.toBeInTheDocument()
  })

  it('seller of a completed order sees what reached the wallet', async () => {
    renderAs(
      'seller-1',
      order({
        status: 'COMPLETED',
        settlement: { settledAt: '2026-11-22T03:00:00.000Z', sellerReceived: 362_500, platformFee: 17_500 },
      }),
    )

    expect(await screen.findByText('Đã nhận vào ví')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xem ví' })).toHaveAttribute('href', '/wallet')
  })
})

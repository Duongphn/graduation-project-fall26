import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../services/api-error'
import { renderWithProviders } from '../../../test/render'
import { systemSettingsApi } from '../api'
import { allSettings } from '../test-fixtures'
import { SystemSettingsPage } from './SystemSettingsPage'

vi.mock('../api', () => ({
  systemSettingsApi: { list: vi.fn(), update: vi.fn(), reset: vi.fn(), publicSettings: vi.fn() },
}))

const list = vi.mocked(systemSettingsApi.list)

const renderAt = (url: string) => {
  const router = createMemoryRouter([{ path: '/admin/settings', element: <SystemSettingsPage /> }], {
    initialEntries: [url],
  })
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  list.mockReset()
  list.mockResolvedValue(allSettings)
})

describe('SystemSettingsPage (UC30 Setting List)', () => {
  it('lists the settings by group with value, default, state and last change', async () => {
    renderAt('/admin/settings')
    const rental = await screen.findByRole('table', { name: 'Thuê đồ' })
    expect(screen.getByRole('table', { name: 'Ví' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Trust Score' })).toBeInTheDocument()
    expect(screen.getByText(/Thay đổi chỉ áp dụng cho giao dịch tạo sau khi lưu \(GB-38\)/)).toBeInTheDocument()

    const changedRow = within(rental).getByText('Hạn thanh toán sau khi chủ đồ đồng ý').closest('tr')!
    expect(within(changedRow).getByText('6 giờ')).toBeInTheDocument()
    expect(within(changedRow).getByText('12 giờ')).toBeInTheDocument()
    expect(within(changedRow).getByText('Đã thay đổi')).toBeInTheDocument()
    expect(within(changedRow).getByText('Admin Một')).toBeInTheDocument()

    const defaultRow = within(rental).getByText('Phí nền tảng đơn thuê').closest('tr')!
    expect(within(defaultRow).getAllByText('10%')).toHaveLength(2)
    expect(within(defaultRow).getByText('Mặc định')).toBeInTheDocument()

    expect(screen.getByText('Giá trị lưu không hợp lệ')).toBeInTheDocument()
  })

  it('opens Setting Detail from the Sửa button and keeps it in the URL', async () => {
    const router = renderAt('/admin/settings')
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa Số tiền rút tối thiểu' }))
    expect(await screen.findByText('Sửa cấu hình: Số tiền rút tối thiểu')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?edit=withdrawal.minAmount')

    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }))
    expect(router.state.location.search).toBe('')
  })

  it('opens Setting Detail from a link (refresh keeps it open) and ignores an unknown key', async () => {
    renderAt('/admin/settings?edit=rental.paymentHours')
    expect(await screen.findByText('Sửa cấu hình: Hạn thanh toán sau khi chủ đồ đồng ý')).toBeInTheDocument()
  })

  it('shows nothing to edit for an unknown key in the link', async () => {
    renderAt('/admin/settings?edit=rental.maxDays')
    await screen.findByRole('table', { name: 'Thuê đồ' })
    expect(screen.queryByText(/Sửa cấu hình:/)).not.toBeInTheDocument()
  })

  it('shows the backend error with a retry button', async () => {
    list.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Chức năng này chỉ dành cho Admin.'))
    renderAt('/admin/settings')
    expect(await screen.findByText('Chức năng này chỉ dành cho Admin.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })
})

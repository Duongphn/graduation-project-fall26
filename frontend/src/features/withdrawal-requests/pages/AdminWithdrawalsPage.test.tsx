import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../services/api-error'
import { renderWithProviders } from '../../../test/render'
import type { Paginated } from '../../../types/api'
import { withdrawalRequestsApi } from '../api'
import type { AdminWithdrawal } from '../types'
import { AdminWithdrawalsPage } from './AdminWithdrawalsPage'

const request = (overrides: Partial<AdminWithdrawal> = {}): AdminWithdrawal => ({
  id: 'w1',
  code: 'WD1763519600000123',
  userId: 'u1',
  amount: 400_000,
  bankInfo: { bankName: 'Vietcombank', accountNumber: '0123456789', accountHolderName: 'NGUYEN VAN A' },
  status: 'pending',
  createdAt: '2026-11-25T02:00:00.000Z',
  updatedAt: '2026-11-25T02:00:00.000Z',
  user: { id: 'u1', fullName: 'Nguyễn Văn A', email: 'a@example.com', phone: '0901234567' },
  ...overrides,
})

const page = (items: AdminWithdrawal[]): Paginated<AdminWithdrawal> => ({
  items,
  pagination: { page: 1, limit: 10, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPrevPage: false },
})

const renderAt = (url = '/admin/withdrawals') => {
  renderWithProviders(
    <MemoryRouter initialEntries={[url]}>
      <AdminWithdrawalsPage />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

// antd modals are slow to open and close in jsdom
const MODAL_TEST_TIMEOUT = 20_000

describe('AdminWithdrawalsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists pending requests with the full bank details and the counts', async () => {
    const list = vi.spyOn(withdrawalRequestsApi, 'list').mockResolvedValue(page([request()]))
    vi.spyOn(withdrawalRequestsApi, 'counts').mockResolvedValue({ pending: 1, completed: 4, rejected: 2 })
    renderAt()

    expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', page: 1 }))
    expect(screen.getByText('0123456789')).toBeInTheDocument()
    expect(screen.getByText('NGUYEN VAN A')).toBeInTheDocument()
    expect(screen.getByText('WD1763519600000123')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Chờ chuyển khoản/ })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('tab', { name: /Đã chuyển khoản\s*4/ })).toBeInTheDocument()
  })

  it('marks a request transferred after confirming the details', async () => {
    vi.spyOn(withdrawalRequestsApi, 'list').mockResolvedValue(page([request()]))
    vi.spyOn(withdrawalRequestsApi, 'counts').mockResolvedValue({ pending: 1, completed: 0, rejected: 0 })
    const processRequest = vi
      .spyOn(withdrawalRequestsApi, 'process')
      .mockResolvedValue(request({ status: 'completed', processedAt: '2026-11-25T03:00:00.000Z' }))
    const user = renderAt()

    await user.click(await screen.findByRole('button', { name: /Đã chuyển khoản/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('Xác nhận đã chuyển khoản?').length).toBeGreaterThan(0)
    expect(within(dialog).getByText('TOYFLOW WD1763519600000123')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Đã chuyển khoản' }))

    await waitFor(() => expect(processRequest).toHaveBeenCalledWith('w1', { status: 'completed' }))
    expect(await screen.findByText('Đã ghi nhận chuyển khoản cho người dùng.')).toBeInTheDocument()
  }, MODAL_TEST_TIMEOUT)

  it('needs a reason to refuse a request, then refunds it', async () => {
    vi.spyOn(withdrawalRequestsApi, 'list').mockResolvedValue(page([request()]))
    vi.spyOn(withdrawalRequestsApi, 'counts').mockResolvedValue({ pending: 1, completed: 0, rejected: 0 })
    const processRequest = vi
      .spyOn(withdrawalRequestsApi, 'process')
      .mockResolvedValue(request({ status: 'rejected', notes: 'Sai tên chủ tài khoản' }))
    const user = renderAt()

    await user.click(await screen.findByRole('button', { name: /Từ chối/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối và hoàn tiền' }))
    expect(processRequest).not.toHaveBeenCalled()

    await user.click(within(dialog).getByText('Tên chủ tài khoản không khớp với ngân hàng'))
    await user.click(within(dialog).getByRole('button', { name: 'Từ chối và hoàn tiền' }))
    await waitFor(() =>
      expect(processRequest).toHaveBeenCalledWith('w1', {
        status: 'rejected',
        notes: 'Tên chủ tài khoản không khớp với ngân hàng',
      }),
    )
    expect(await screen.findByText('Đã từ chối lệnh rút và hoàn tiền vào ví người dùng.')).toBeInTheDocument()
  }, MODAL_TEST_TIMEOUT)

  it('shows the server message when the account is locked', async () => {
    vi.spyOn(withdrawalRequestsApi, 'list').mockResolvedValue(page([request()]))
    vi.spyOn(withdrawalRequestsApi, 'counts').mockResolvedValue({ pending: 1, completed: 0, rejected: 0 })
    vi.spyOn(withdrawalRequestsApi, 'process').mockRejectedValue(
      new ApiError(403, 'WALLET_FROZEN', 'Ví đang bị đóng băng vì tài khoản bị khóa.'),
    )
    const user = renderAt()

    await user.click(await screen.findByRole('button', { name: /Đã chuyển khoản/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Đã chuyển khoản' }))
    expect(await screen.findByText('Ví đang bị đóng băng vì tài khoản bị khóa.', {}, { timeout: 5000 })).toBeInTheDocument()
  }, MODAL_TEST_TIMEOUT)

  it('shows the result and reason of processed requests', async () => {
    const list = vi.spyOn(withdrawalRequestsApi, 'list').mockResolvedValue(
      page([request({ status: 'rejected', notes: 'Sai tên chủ tài khoản', processedAt: '2026-11-25T03:00:00.000Z' })]),
    )
    vi.spyOn(withdrawalRequestsApi, 'counts').mockResolvedValue({ pending: 0, completed: 0, rejected: 1 })
    renderAt('/admin/withdrawals?status=rejected')

    expect(await screen.findByText('Lý do: Sai tên chủ tài khoản')).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }))
    expect(screen.queryByRole('button', { name: /Từ chối/ })).not.toBeInTheDocument()
  })
})

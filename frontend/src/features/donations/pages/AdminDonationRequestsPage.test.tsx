import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { organizationsApi } from '../../organizations/api'
import type { Organization } from '../../organizations/types'
import { donationRequestsApi } from '../api'
import type { DonationRequest } from '../types'
import { AdminDonationRequestsPage } from './AdminDonationRequestsPage'

// No network: the admin api modules are replaced; each test decides what the server answers.
vi.mock('../api', () => ({ donationRequestsApi: { list: vi.fn(), counts: vi.fn() } }))
vi.mock('../../organizations/api', () => ({ organizationsApi: { list: vi.fn() } }))
vi.mock('../../toy-moderation/api', () => ({ toyModerationApi: { queue: vi.fn() } }))

const list = vi.mocked(donationRequestsApi.list)
const counts = vi.mocked(donationRequestsApi.counts)

const HOA_SEN = '66a000000000000000000001'

const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 10, totalItems: items.length, totalPages: 1, hasNextPage: false, hasPrevPage: false },
})

const overdueRequest = {
  id: '64b0000000000000000000d1',
  code: 'DNABC123',
  status: 'shipping',
  receiverType: 'ORGANIZATION',
  overdue: true,
  confirmDueAt: '2026-11-15T03:00:00.000Z',
  toy: { id: 't1', title: 'Bộ tàu hỏa gỗ', imageUrl: null },
  donor: { id: 'u1', fullName: 'Người Tặng', avatarUrl: null },
  organization: { id: HOA_SEN, name: 'Mái ấm Hoa Sen' },
  createdAt: '2026-11-01T00:00:00.000Z',
} as unknown as DonationRequest

const renderPage = (search = '') => {
  const router = createMemoryRouter([{ path: '/admin/donation-requests', element: <AdminDonationRequestsPage /> }], {
    initialEntries: [`/admin/donation-requests${search}`],
  })
  renderWithProviders(<RouterProvider router={router} />)
  return { user: userEvent.setup(), router }
}

beforeEach(() => {
  vi.clearAllMocks()
  list.mockResolvedValue(page([overdueRequest]))
  counts.mockResolvedValue({
    pending: 0,
    accepted: 0,
    shipping: 1,
    received: 0,
    completed: 0,
    rejected: 0,
    cancelled: 0,
    expired: 0,
  })
  vi.mocked(organizationsApi.list).mockResolvedValue(
    page([{ id: HOA_SEN, name: 'Mái ấm Hoa Sen' } as Organization]),
  )
})

describe('AdminDonationRequestsPage (UC35 step 1)', () => {
  it('reads the organization, province and overdue filters from the URL and flags overdue rows', async () => {
    renderPage(`?organizationId=${HOA_SEN}&province=${encodeURIComponent('Hồ Chí Minh')}&overdue=true`)

    expect(await screen.findByText('Quá hạn xác nhận', { selector: '.ant-tag' })).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: HOA_SEN, province: 'Hồ Chí Minh', overdue: 'true' }),
    )
    expect(counts).toHaveBeenCalledWith({ organizationId: HOA_SEN, province: 'Hồ Chí Minh', overdue: 'true' })
    expect(screen.getByRole('checkbox', { name: 'Quá hạn xác nhận' })).toBeChecked()
    expect(screen.getByLabelText('Lọc theo tỉnh/thành của điểm nhận')).toHaveValue('Hồ Chí Minh')
    expect(await screen.findByTitle('Mái ấm Hoa Sen')).toBeInTheDocument()
  })

  it('finds an organization typed without accents and filters by it', async () => {
    const { user, router } = renderPage()
    await screen.findByText('DNABC123')

    await user.click(screen.getByLabelText('Lọc theo tổ chức'))
    await user.keyboard('mai am')
    await user.click(await screen.findByTitle('Mái ấm Hoa Sen'))
    await waitFor(() => expect(router.state.location.search).toContain(`organizationId=${HOA_SEN}`))
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ organizationId: HOA_SEN }))
  }, 20_000)

  it('drops a filter value that is not valid in the URL', async () => {
    renderPage('?organizationId=abc&overdue=yes')

    await waitFor(() => expect(list).toHaveBeenCalled())
    const params = list.mock.calls.at(-1)?.[0]
    expect(params).not.toHaveProperty('organizationId')
    expect(params).not.toHaveProperty('overdue')
  })

  it('filters the overdue receipts with the checkbox and the province typed by the Admin', async () => {
    const { user, router } = renderPage()
    await screen.findByText('DNABC123')

    await user.click(screen.getByRole('checkbox', { name: 'Quá hạn xác nhận' }))
    await waitFor(() => expect(router.state.location.search).toContain('overdue=true'))

    const province = screen.getByLabelText('Lọc theo tỉnh/thành của điểm nhận')
    await user.click(province)
    await user.paste('  hà nội ')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ province: 'hà nội' })))
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ overdue: 'true' }))
  }, 20_000)
})

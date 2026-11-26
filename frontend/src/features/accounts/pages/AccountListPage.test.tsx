import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { accountsApi } from '../api'
import type { AccountListItem } from '../types'
import { AccountListPage } from './AccountListPage'

vi.mock('../api', () => ({ accountsApi: { list: vi.fn(), counts: vi.fn() } }))

const list = vi.mocked(accountsApi.list)
const counts = vi.mocked(accountsApi.counts)

const row: AccountListItem = {
  id: '64b000000000000000000041',
  fullName: 'Người thuê điểm thấp',
  avatar: null,
  maskedPhone: '+8490***0041',
  maskedEmail: 'lo***@toyflow.test',
  role: 'USER',
  accountStatus: 'ACTIVE',
  lockedUntil: null,
  verificationStatus: 'verified',
  trustScore: 49,
  violationCount: 0,
  pendingReportCount: 0,
  trustBlockStatus: null,
  createdAt: '2026-10-01T00:00:00.000Z',
}

const renderAt = (url: string) => {
  const router = createMemoryRouter([{ path: '/admin/users', element: <AccountListPage /> }], {
    initialEntries: [url],
  })
  renderWithProviders(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  list.mockReset()
  counts.mockReset()
  list.mockResolvedValue({
    items: [row],
    pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
  })
  counts.mockResolvedValue({ all: 1, active: 1, locked: 0, reported: 0, trust_review: 0 })
})

describe('AccountListPage: Trust Score band filter (R03 III.7.2.1 (2))', () => {
  it('sends the band of the URL to the list and to the tab counters', async () => {
    renderAt('/admin/users?trustBand=low&role=USER')

    expect(await screen.findByText('Người thuê điểm thấp')).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 10, tab: 'all', role: 'USER', trustBand: 'low' })
    expect(counts).toHaveBeenCalledWith({ role: 'USER', trustBand: 'low' })
    expect(screen.getByText('Dưới 50 (hạn chế thuê)')).toBeInTheDocument()
  })

  it('offers the three bands and filters by the one chosen', async () => {
    const user = userEvent.setup()
    const router = renderAt('/admin/users')
    await screen.findByText('Người thuê điểm thấp')
    expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 10, tab: 'all' })

    await user.click(screen.getByRole('combobox', { name: 'Điểm tin cậy' }))
    expect(await screen.findByText('Từ 50 đến 99')).toBeInTheDocument()
    expect(screen.getByText('100 (điểm tối đa)')).toBeInTheDocument()
    await user.click(screen.getByText('Từ 50 đến 99'))

    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 10, tab: 'all', trustBand: 'medium' }))
    expect(counts).toHaveBeenLastCalledWith({ trustBand: 'medium' })
    expect(router.state.location.search).toBe('?trustBand=medium')
  }, 15_000)

  it('ignores a band that does not exist instead of breaking the page', async () => {
    renderAt('/admin/users?trustBand=thap')

    expect(await screen.findByText('Người thuê điểm thấp')).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 10, tab: 'all' })
  })
})

describe('AccountListPage: Renters blocked by a low Trust Score (UC29, FE-09)', () => {
  it('shows the "Bị chặn do Trust Score" tab with its counter and lists the open reviews', async () => {
    const user = userEvent.setup()
    counts.mockResolvedValue({ all: 4, active: 4, locked: 0, reported: 0, trust_review: 2 })
    list.mockResolvedValue({
      items: [
        { ...row, trustBlockStatus: 'review' },
        { ...row, id: '64b000000000000000000042', fullName: 'Người đã được gỡ chặn', trustScore: 40, trustBlockStatus: 'lifted' },
      ],
      pagination: { page: 1, limit: 10, totalItems: 2, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    })
    const router = renderAt('/admin/users')

    const tab = await screen.findByRole('tab', { name: /Bị chặn do Trust Score/ })
    await waitFor(() => expect(tab).toHaveTextContent('2'))
    expect(screen.getByText('Chờ xem xét Trust Score')).toBeInTheDocument()
    expect(screen.getByText('Đã gỡ chặn Trust Score')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Xem xét/ })).toBeInTheDocument()

    await user.click(tab)
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 10, tab: 'trust_review' }))
    expect(router.state.location.search).toBe('?tab=trust_review')
  }, 15_000)

  it('opens the tab from the URL and falls back to "all" for an unknown tab', async () => {
    renderAt('/admin/users?tab=trust_review&trustBand=low')
    await screen.findByText('Người thuê điểm thấp')
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 10, tab: 'trust_review', trustBand: 'low' })
    list.mockClear()
    renderAt('/admin/users?tab=TRUST_REVIEW')
    await waitFor(() => expect(list).toHaveBeenCalledWith({ page: 1, limit: 10, tab: 'all' }))
  })
})

import { screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { identityVerificationsApi } from '../../features/identity-verifications/api'
import { toyModerationApi } from '../../features/toy-moderation/api'
import { renderWithProviders } from '../../test/render'
import { AdminLayout } from './AdminLayout'

vi.mock('../../features/toy-moderation/api', () => ({
  toyModerationApi: { counts: vi.fn() },
}))
vi.mock('../../features/identity-verifications/api', () => ({
  identityVerificationsApi: { counts: vi.fn() },
}))

const toyCounts = vi.mocked(toyModerationApi.counts)
const identityCounts = vi.mocked(identityVerificationsApi.counts)

const renderLayout = () => {
  const router = createMemoryRouter(
    [{ path: '/admin', element: <AdminLayout />, children: [{ index: true, element: null }] }],
    { initialEntries: ['/admin'] },
  )
  renderWithProviders(<RouterProvider router={router} />)
}

const menuItem = (label: string) => screen.getByText(label).closest('li') as HTMLElement

beforeEach(() => {
  toyCounts.mockReset()
  identityCounts.mockReset()
})

describe('AdminLayout pending counters (L7)', () => {
  it('shows the pending listings and identity requests next to their menu entries', async () => {
    toyCounts.mockResolvedValue({ pending: 4, active: 20, hidden: 1 })
    identityCounts.mockResolvedValue({ pending: 2, verified: 9, rejected: 1 })
    renderLayout()

    expect(await screen.findByTitle('4 đang chờ duyệt')).toBeInTheDocument()
    expect(within(menuItem('Duyệt tin đăng')).getByTitle('4 đang chờ duyệt')).toBeInTheDocument()
    expect(
      within(menuItem('Xác minh danh tính')).getByTitle('2 đang chờ duyệt'),
    ).toBeInTheDocument()
    // Counted over every listing, not a filtered view.
    expect(toyCounts).toHaveBeenCalledWith({})
  })

  it('shows no counter when nothing is pending', async () => {
    toyCounts.mockResolvedValue({ pending: 0, active: 3, hidden: 0 })
    identityCounts.mockResolvedValue({ pending: 0, verified: 1, rejected: 0 })
    renderLayout()

    await vi.waitFor(() => expect(identityCounts).toHaveBeenCalled())
    expect(screen.queryByTitle(/đang chờ duyệt/)).not.toBeInTheDocument()
  })
})

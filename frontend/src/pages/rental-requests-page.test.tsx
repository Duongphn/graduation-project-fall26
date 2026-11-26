import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RentalOrderItem } from '../features/rentals/rental-orders-api'
import { PATHS } from '../routes/paths'
import { getCurrentRole } from '../services/current-role'
import { httpClient } from '../services/http-client'
import { renderWithProviders } from '../test/render'
import { RentalOrdersListPage } from './rental-requests-page'

// No network: the axios instance is replaced; each test decides what the server answers.
vi.mock('../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

vi.mock('../services/current-role', () => ({ getCurrentRole: vi.fn(() => 'USER') }))

// The site header and footer (theme, account, notifications) are not part of this list.
vi.mock('../layouts/site/site-layout', () => ({
  SiteLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const get = vi.mocked(httpClient.get)

const item: RentalOrderItem = {
  id: '64d000000000000000000001',
  code: 'RT-0001',
  role: 'renter',
  status: 'IN_USE',
  period: { startDate: '2026-11-20', endDate: '2026-11-22' },
  pricing: { days: 3, dailyRate: 20_000, rentalFee: 60_000, depositAmount: 300_000, totalPayable: 360_000 },
  toy: { id: '64c000000000000000000001', name: 'Tàu hoả gỗ', slug: 'tau-hoa-go', dailyRate: 20_000, depositAmount: 300_000 },
  counterpart: { id: '64a000000000000000000002', fullName: 'Chị Lan', verified: true, role: 'owner' },
  createdAt: '2026-11-18T08:00:00.000Z',
}

/** GET /rentals answers one page; nothing else on this page calls the API */
const answer = (items: RentalOrderItem[]) =>
  get.mockImplementation(async (url) => {
    if (url === '/rentals') return { data: { success: true, data: { items, total: items.length, page: 1, limit: 10 } } }
    throw new Error('not mocked')
  })

const rentalCalls = () =>
  get.mock.calls.filter(([url]) => url === '/rentals').map(([, config]) => config?.params as Record<string, unknown>)

const renderPage = (entry: string) => {
  const router = createMemoryRouter(
    [
      { path: PATHS.myRentals, element: <RentalOrdersListPage role="renter" /> },
      { path: PATHS.rentalRequests, element: <RentalOrdersListPage role="owner" /> },
    ],
    { initialEntries: [entry] },
  )
  renderWithProviders(<RouterProvider router={router} />)
  return { router, user: userEvent.setup() }
}

beforeEach(() => {
  get.mockReset()
  vi.mocked(getCurrentRole).mockReturnValue('USER')
})

describe('RentalOrdersListPage', () => {
  it('shows the toy and the counterpart sent with the list, without fetching each toy', async () => {
    answer([item])
    renderPage(PATHS.myRentals)

    expect(await screen.findByText('Tàu hoả gỗ')).toBeInTheDocument()
    expect(screen.getByText('Chị Lan')).toBeInTheDocument()
    expect(screen.getByLabelText('Đã xác thực danh tính')).toBeInTheDocument()
    expect(get.mock.calls.some(([url]) => String(url).startsWith('/toys/'))).toBe(false)
  })

  it('puts the status group in the URL and asks the server for that group', async () => {
    answer([item])
    const { router, user } = renderPage(PATHS.myRentals)
    await screen.findByText('Tàu hoả gỗ')
    expect(rentalCalls()[0]).toMatchObject({ role: 'renter', group: undefined, page: 1 })

    await user.click(screen.getByRole('tab', { name: 'Đang diễn ra' }))

    expect(router.state.location.search).toBe('?group=active')
    expect(screen.getByRole('tab', { name: 'Đang diễn ra' })).toHaveAttribute('aria-selected', 'true')
    expect(rentalCalls().at(-1)).toMatchObject({ role: 'renter', group: 'active' })

    // Back to "Tất cả" removes the group from the URL
    await user.click(screen.getByRole('tab', { name: 'Tất cả' }))
    expect(router.state.location.search).toBe('')
  })

  it('reads the group from the URL on load and keeps it when switching role tabs', async () => {
    answer([])
    const { router, user } = renderPage(`${PATHS.myRentals}?group=completed`)

    expect(await screen.findByText('Không có đơn nào trong nhóm “Hoàn tất”.')).toBeInTheDocument()
    expect(rentalCalls()[0]).toMatchObject({ group: 'completed' })

    const roles = screen.getByRole('navigation', { name: 'Vai trò' })
    expect(within(roles).getByRole('link', { name: 'Tôi thuê' })).toHaveAttribute('aria-current', 'page')
    await user.click(within(roles).getByRole('link', { name: 'Cho thuê' }))

    expect(router.state.location.pathname).toBe(PATHS.rentalRequests)
    expect(router.state.location.search).toBe('?group=completed')
    expect(rentalCalls().at(-1)).toMatchObject({ role: 'owner', group: 'completed' })
  })

  it('falls back to all groups when the URL has an unknown group', async () => {
    answer([])
    renderPage(`${PATHS.myRentals}?group=nope`)

    expect(await screen.findByText('Chưa có đơn thuê nào.')).toBeInTheDocument()
    expect(rentalCalls()[0]).toMatchObject({ group: undefined })
  })

  it('shows the "Tất cả" role tab to admins only, and ?role=all lists every order', async () => {
    answer([])
    renderPage(`${PATHS.myRentals}?role=all`)
    await screen.findByText('Chưa có đơn thuê nào.')
    // A normal user with ?role=all still sees their own rentals
    expect(rentalCalls()[0]).toMatchObject({ role: 'renter' })
    expect(within(screen.getByRole('navigation', { name: 'Vai trò' })).queryByRole('link', { name: 'Tất cả' })).toBeNull()
  })

  it('lets an admin list all orders with ?role=all', async () => {
    vi.mocked(getCurrentRole).mockReturnValue('ADMIN')
    answer([])
    renderPage(`${PATHS.myRentals}?role=all`)

    expect(await screen.findByRole('heading', { name: 'Tất cả đơn thuê' })).toBeInTheDocument()
    expect(rentalCalls()[0]).toMatchObject({ role: 'all' })
    const roles = screen.getByRole('navigation', { name: 'Vai trò' })
    expect(within(roles).getByRole('link', { name: 'Tất cả' })).toHaveAttribute('aria-current', 'page')
  })
})


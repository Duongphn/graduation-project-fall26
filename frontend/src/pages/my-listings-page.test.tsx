import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Category, ToyListing } from '../features/toy-listings/toy-listing-api'
import { categoriesQuery, listingCountsQuery, myListingsQuery } from '../features/toy-listings/toy-listing-queries'
import { PATHS } from '../routes/paths'
import { httpClient } from '../services/http-client'
import { createTestQueryClient, renderWithProviders } from '../test/render'
import { MyListingsPage } from './my-listings-page'

// No network: the axios instance is replaced; each test decides what the server answers.
vi.mock('../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const get = vi.mocked(httpClient.get)

const WOOD: Category = { id: '64b000000000000000000001', name: 'Đồ chơi gỗ', slug: 'do-choi-go', parentId: null }

const toy = (id: string, categoryId: string, categoryName: string, title: string): ToyListing => ({
  id,
  ownerId: '64a000000000000000000001',
  categoryId,
  categoryName,
  title,
  description: 'Đồ chơi đã vệ sinh sạch sẽ, đủ chi tiết và còn hộp đựng như lúc mới mua về.',
  condition: 'Mới',
  listingType: 'rent',
  priceOrRate: 20_000,
  depositPrice: 300_000,
  ageRange: { minAge: 3, maxAge: 6 },
  images: [],
  quantity: 1,
  status: 'active',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
})

const inWood = toy('64c000000000000000000001', WOOD.id, WOOD.name, 'Tàu hoả gỗ')
// Its category was hidden by an Admin: GET /categories (active categories only) no longer has it.
const inHidden = toy('64c000000000000000000002', '64b000000000000000000003', 'Đồ chơi nhập vai', 'Bộ nấu ăn mini')

// GET /categories lists WOOD only; GET /toys/mine answers the page and the per-status counts.
const answer = (items: ToyListing[]) =>
  get.mockImplementation(async (url, config) => {
    if (url === '/categories') return { data: [WOOD] }
    const { limit } = config?.params as { limit: number }
    return { data: { items: items.slice(0, limit), page: 1, limit, total: items.length } }
  })

const mineCalls = () => get.mock.calls.filter(([url]) => url === '/toys/mine').length

const renderPage = async () => {
  const queryClient = createTestQueryClient()
  // What the route loader (myListingsLoader) does before the page renders: errors stay in the cache.
  await Promise.all([
    queryClient.query(myListingsQuery({ page: 1 })).catch(() => undefined),
    queryClient.query(listingCountsQuery).catch(() => undefined),
    queryClient.query(categoriesQuery).catch(() => undefined),
  ])
  const router = createMemoryRouter([{ path: PATHS.myListings, element: <MyListingsPage /> }], {
    initialEntries: [PATHS.myListings],
  })
  renderWithProviders(<RouterProvider router={router} />, queryClient)
  return { user: userEvent.setup() }
}

beforeEach(() => {
  get.mockReset()
})

describe('MyListingsPage', () => {
  it('shows the category name the API sends when GET /categories no longer lists the category', async () => {
    answer([inWood, inHidden])
    await renderPage()

    expect(await screen.findByText(/· Đồ chơi gỗ$/)).toBeInTheDocument()
    expect(screen.getByText(/· Đồ chơi nhập vai$/)).toBeInTheDocument()
  })

  it('shows the error of the loader without calling the API again, and "Thử lại" reloads', async () => {
    get.mockRejectedValue(new Error('Network Error'))
    const { user } = await renderPage()
    // The loader asked for the page (1 call) and the five status counts (5 calls).
    expect(mineCalls()).toBe(6)

    expect(await screen.findByText('Đã có lỗi bất ngờ xảy ra. Vui lòng thử lại.')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mineCalls()).toBe(6)

    answer([inWood])
    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('link', { name: 'Tàu hoả gỗ' })).toBeInTheDocument()
    expect(mineCalls()).toBe(12)
  })

  it('shows a rejected listing as "Bị từ chối" with its reason, and the Owner can edit it', async () => {
    const rejected: ToyListing = {
      ...inWood,
      status: 'hidden',
      moderation: { reviewedAt: '2026-11-01T08:00:00.000Z', rejectReason: 'Ảnh bị mờ, chụp lại giúp' },
    }
    const hidden: ToyListing = { ...inHidden, status: 'hidden' }
    answer([rejected, hidden])
    const { user } = await renderPage()

    expect(await screen.findByText('Bị từ chối')).toBeInTheDocument()
    // A listing the Owner hid has no reason.
    expect(screen.getByText('Đã ẩn', { selector: '.status-badge' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Xem lý do' })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Xem lý do' }))
    expect(screen.getByText(/Ảnh bị mờ, chụp lại giúp/)).toHaveTextContent(
      'Lý do từ chối: Ảnh bị mờ, chụp lại giúp Sửa tin rồi lưu để gửi duyệt lại.',
    )
    expect(screen.getAllByRole('link', { name: 'Sửa' })).toHaveLength(2)
  })
})

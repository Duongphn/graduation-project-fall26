import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Category, ToyListing } from '../features/toy-listings/toy-listing-api'
import { categoriesQuery, myListingQuery } from '../features/toy-listings/toy-listing-queries'
import { PATHS, toyListingEditPath } from '../routes/paths'
import { httpClient } from '../services/http-client'
import { createTestQueryClient, renderWithProviders } from '../test/render'
import { ToyListingEditorPage } from './toy-listing-editor-page'

// No network: the axios instance is replaced; each test decides what the server answers.
vi.mock('../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const get = vi.mocked(httpClient.get)
const post = vi.mocked(httpClient.post)
const patch = vi.mocked(httpClient.patch)

const WOOD: Category = { id: '64b000000000000000000001', name: 'Đồ chơi gỗ', slug: 'do-choi-go', parentId: null }
const CARS: Category = { id: '64b000000000000000000002', name: 'Xe điều khiển', slug: 'xe-dieu-khien', parentId: null }

const saved: ToyListing = {
  id: '64c000000000000000000001',
  ownerId: '64a000000000000000000001',
  categoryId: WOOD.id,
  categoryName: WOOD.name,
  title: 'Tàu hoả gỗ 20 chi tiết',
  description: 'Bộ tàu hoả gỗ 20 chi tiết, đủ ray và toa, đã vệ sinh sạch sẽ, còn hộp.',
  condition: 'Mới',
  listingType: 'rent',
  priceOrRate: 20_000,
  depositPrice: 300_000,
  ageRange: { minAge: 3, maxAge: 6 },
  images: [{ url: 'https://cdn.test/1.jpg', publicId: 'toyflow/toys/1' }],
  quantity: 1,
  status: 'pending',
  createdAt: '2026-10-29T00:00:00.000Z',
  updatedAt: '2026-10-29T00:00:00.000Z',
}

// How httpClient (axios) rejects a backend error envelope.
const httpError = (status: number, code: string, message: string) =>
  new AxiosError(message, 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { success: false, error: { code, message } },
  })

// The two editor routes of app-routes.tsx. Same element on both, so React keeps one page instance
// when "Đăng tin" moves from /listings/new to /listings/:toyId/edit.
const renderEditor = (url: string, listing?: ToyListing) => {
  const queryClient = createTestQueryClient()
  // What the route loaders put in the cache before the page renders.
  queryClient.setQueryData(categoriesQuery.queryKey, [WOOD, CARS])
  if (listing) queryClient.setQueryData(myListingQuery(listing.id).queryKey, listing)
  const router = createMemoryRouter(
    [
      { path: PATHS.newListing, element: <ToyListingEditorPage /> },
      { path: PATHS.editListing, element: <ToyListingEditorPage /> },
    ],
    { initialEntries: [url] },
  )
  renderWithProviders(<RouterProvider router={router} />, queryClient)
  return { router, user: userEvent.setup() }
}

const categorySelect = () => screen.getByRole('combobox', { name: /^Danh mục/ })

beforeAll(() => {
  // jsdom has no object URLs; the photo uploader previews the chosen files with them.
  URL.createObjectURL = () => 'blob:toy-photo'
  URL.revokeObjectURL = () => undefined
})

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  patch.mockReset()
})

describe('ToyListingEditorPage', () => {
  it('shows the success toast after a new listing is posted, and not again on reload', async () => {
    post.mockResolvedValue({ data: saved })
    const { router, user } = renderEditor(PATHS.newListing)

    await user.upload(
      screen.getByLabelText(/Kéo thả ảnh vào đây/),
      new File(['toy'], 'toy.jpg', { type: 'image/jpeg' }),
    )
    await user.type(screen.getByRole('textbox', { name: /^Tên đồ chơi/ }), saved.title)
    await user.selectOptions(categorySelect(), 'Đồ chơi gỗ')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Độ tuổi phù hợp/ }), '3 - 6 tuổi (Mẫu giáo)')
    await user.click(screen.getByRole('radio', { name: /Brand new nguyên hộp/ }))
    await user.click(screen.getByRole('textbox', { name: /^Mô tả chi tiết/ }))
    await user.paste(saved.description)
    await user.type(screen.getByRole('textbox', { name: /^Giá thuê theo ngày/ }), '20000')
    await user.type(screen.getByRole('textbox', { name: /^Tiền cọc bảo chứng/ }), '300000')
    await user.click(screen.getByRole('button', { name: 'Đăng tin' }))

    expect(await screen.findByText('Đăng tin thành công! Tin đang ở trạng thái chờ duyệt.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(toyListingEditPath(saved.id))
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument()
    // A new listing always sends its category.
    expect((post.mock.calls[0]?.[1] as FormData).get('categoryId')).toBe(WOOD.id)
    // The "just created" state is dropped, so reloading the edit page shows no toast.
    await waitFor(() => expect(router.state.location.state).toBeNull())
  })

  it('reloads the categories when the server says the chosen one is no longer active', async () => {
    // An Admin hid "Xe điều khiển" after the page loaded the categories.
    patch.mockRejectedValue(httpError(400, 'CATEGORY_NOT_FOUND', 'Category not found.'))
    get.mockResolvedValue({ data: [WOOD] })
    const { user } = renderEditor(toyListingEditPath(saved.id), saved)

    await user.selectOptions(categorySelect(), 'Xe điều khiển')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    expect(
      await screen.findByText('Danh mục đã chọn không còn hoạt động. Vui lòng chọn danh mục khác.'),
    ).toBeInTheDocument()
    expect((patch.mock.calls[0]?.[1] as FormData).get('categoryId')).toBe(CARS.id)
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Xe điều khiển' })).not.toBeInTheDocument())
    expect(get).toHaveBeenCalledWith('/categories')
  })
})

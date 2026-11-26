import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Category, ToyListing } from '../features/toy-listings/toy-listing-api'
import { profileQuery } from '../features/profile/profile-queries'
import { categoriesQuery, myListingQuery } from '../features/toy-listings/toy-listing-queries'
import { ThemeProvider } from '../contexts/theme-provider'
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
  // A rental has at least 3 photos (GB-10).
  images: [1, 2, 3].map((n) => ({ url: `https://cdn.test/${n}.jpg`, publicId: `toyflow/toys/${n}` })),
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
  renderWithProviders(
    // AccountLayout có nút đổi giao diện (cần ThemeProvider như ở main.tsx)
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
    queryClient,
  )
  return { router, user: userEvent.setup() }
}

// UC05: every save of a rent or sale listing needs all safety commitments ticked.
const tickSafety = async (user: ReturnType<typeof userEvent.setup>) => {
  for (const box of within(screen.getByRole('group', { name: /Cam kết an toàn/ })).getAllByRole('checkbox')) {
    if (!(box as HTMLInputElement).checked) await user.click(box)
  }
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
      [1, 2, 3].map((n) => new File(['toy'], `toy-${n}.jpg`, { type: 'image/jpeg' })),
    )
    await user.type(screen.getByRole('textbox', { name: /^Tên đồ chơi/ }), saved.title)
    await user.selectOptions(categorySelect(), 'Đồ chơi gỗ')
    await user.selectOptions(screen.getByRole('combobox', { name: /^Độ tuổi phù hợp/ }), '3 - 6 tuổi (Mẫu giáo)')
    await user.click(screen.getByRole('radio', { name: /Brand new nguyên hộp/ }))
    await user.click(screen.getByRole('textbox', { name: /^Mô tả chi tiết/ }))
    await user.paste(saved.description)
    await user.type(screen.getByRole('textbox', { name: /^Giá thuê theo ngày/ }), '20000')
    await user.type(screen.getByRole('textbox', { name: /^Tiền cọc bảo chứng/ }), '300000')
    await tickSafety(user)
    await user.click(screen.getByRole('button', { name: 'Đăng tin' }))

    expect(await screen.findByText('Đăng tin thành công! Tin đang ở trạng thái chờ duyệt.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(toyListingEditPath(saved.id))
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument()
    // A new listing always sends its category.
    expect((post.mock.calls[0]?.[1] as FormData).get('categoryId')).toBe(WOOD.id)
    // The "just created" state is dropped, so reloading the edit page shows no toast.
    await waitFor(() => expect(router.state.location.state).toBeNull())
    // Fills in the whole form, photos and safety commitments included: slow under a full parallel run.
  }, 15_000)

  it('reloads the categories and clears the choice when the server says the chosen one is no longer active', async () => {
    // An Admin hid "Xe điều khiển" after the page loaded the categories.
    patch.mockRejectedValueOnce(httpError(400, 'CATEGORY_NOT_FOUND', 'Category not found.'))
    get.mockResolvedValue({ data: [WOOD] })
    const { user } = renderEditor(toyListingEditPath(saved.id), saved)

    await user.selectOptions(categorySelect(), 'Xe điều khiển')
    await tickSafety(user)
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    expect(
      await screen.findByText('Danh mục đã chọn không còn hoạt động. Vui lòng chọn danh mục khác.'),
    ).toBeInTheDocument()
    expect((patch.mock.calls[0]?.[1] as FormData).get('categoryId')).toBe(CARS.id)
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Xe điều khiển' })).not.toBeInTheDocument())
    expect(get).toHaveBeenCalledWith('/categories')

    // The select is empty again instead of showing a category the owner did not pick, and says why.
    expect(categorySelect()).toHaveValue('')
    expect(categorySelect()).toHaveDisplayValue('Chọn danh mục')
    expect(categorySelect()).toHaveAccessibleDescription(
      'Danh mục vừa chọn không còn hoạt động, vui lòng chọn danh mục khác',
    )

    // Saving again cannot resend the removed category: the empty select stops the save.
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Vui lòng chọn danh mục')).toBeInTheDocument()
    expect(patch).toHaveBeenCalledTimes(1)

    // Once a category is picked, the save goes out. Back on the toy's own category, nothing is sent
    // for it. (The request is left pending: only what it sends matters here.)
    patch.mockReturnValueOnce(new Promise(() => {}))
    await user.selectOptions(categorySelect(), 'Đồ chơi gỗ')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2))
    expect((patch.mock.calls[1]?.[1] as FormData).has('categoryId')).toBe(false)
  })

  it('asks the owner to reload when another save changed the listing meanwhile', async () => {
    patch.mockRejectedValueOnce(
      httpError(409, 'LISTING_CHANGED', 'The listing was changed in the meantime. Reload it and try again.'),
    )
    const { user } = renderEditor(toyListingEditPath(saved.id), saved)

    await tickSafety(user)
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    expect(
      await screen.findByText('Tin đăng vừa được thay đổi ở nơi khác. Vui lòng tải lại trang rồi thử lại.'),
    ).toBeInTheDocument()
  })

  it('says the edited listing waits for the Admin again', async () => {
    patch.mockResolvedValue({ data: { ...saved, status: 'pending' } })
    const { user } = renderEditor(toyListingEditPath(saved.id), { ...saved, status: 'active' })

    await tickSafety(user)
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    expect(
      await screen.findByText(`Đã lưu thay đổi. Tin #TF-${saved.id.slice(-5).toUpperCase()} đang chờ Quản trị viên duyệt.`),
    ).toBeInTheDocument()
  })

  it('says a listing its Owner hid stays hidden until it is shown again (GB-08)', async () => {
    patch.mockResolvedValue({ data: { ...saved, status: 'hidden' } })
    const { user } = renderEditor(toyListingEditPath(saved.id), { ...saved, status: 'hidden' })

    await tickSafety(user)
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    expect(
      await screen.findByText(
        `Đã lưu thay đổi. Tin #TF-${saved.id.slice(-5).toUpperCase()} vẫn đang ẩn, bấm "Hiện lại" ở Tin đăng của tôi để gửi duyệt.`,
      ),
    ).toBeInTheDocument()
  })

  it('asks an Owner whose identity is not verified to verify it before posting (MSG17)', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(categoriesQuery.queryKey, [WOOD, CARS])
    queryClient.setQueryData(profileQuery.queryKey, {
      id: '64a000000000000000000001',
      fullName: 'Chủ đồ chơi',
      email: 'owner@test.vn',
      phone: '0912345678',
      dateOfBirth: null,
      gender: null,
      bio: null,
      trustScore: 100,
      memberSince: '2026-10-01T00:00:00.000Z',
      verificationStatus: 'pending',
      role: 'USER',
    })
    const router = createMemoryRouter([{ path: PATHS.newListing, element: <ToyListingEditorPage /> }], {
      initialEntries: [PATHS.newListing],
    })
    renderWithProviders(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
      queryClient,
    )

    expect(await screen.findByText('Vui lòng xác minh danh tính trước khi tiếp tục.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xác minh danh tính' })).toHaveAttribute('href', PATHS.identityVerification)
    expect(screen.queryByRole('button', { name: 'Đăng tin' })).not.toBeInTheDocument()
  })

  // UC33 5.1, BF-04 3a: a donation post the Admin rejected is edited with the donation form (no
  // price) and sent for review again.
  it('lets the Donor edit a rejected donation post and send it for review again', async () => {
    const donation = {
      ...saved,
      listingType: 'donate',
      priceOrRate: 0,
      depositPrice: undefined,
      condition: 'Như mới (90–99%)',
      status: 'hidden',
      moderation: { reviewedAt: '2026-11-01T08:00:00.000Z', rejectReason: 'Ảnh chưa rõ, chụp lại giúp' },
    } as unknown as ToyListing
    patch.mockResolvedValue({ data: { ...donation, status: 'pending', moderation: { submittedAt: '2026-11-02T00:00:00.000Z' } } })
    const { user } = renderEditor(toyListingEditPath(saved.id), donation)

    expect(screen.queryByText(/Tin tặng không chỉnh sửa ở đây/)).not.toBeInTheDocument()
    expect(screen.getByText('Ảnh chưa rõ, chụp lại giúp')).toBeInTheDocument()
    const description = screen.getByPlaceholderText(/^Đồ chơi gồm những gì/)
    await user.clear(description)
    await user.click(description)
    await user.paste('Bộ tàu hoả gỗ 20 chi tiết, đủ ray và toa, đã chụp lại rõ từng mặt theo góp ý của Admin.')
    // The four safety commitments are ticked again on every submission.
    await user.click(screen.getByRole('button', { name: 'Gửi duyệt lại' }))
    expect(patch).not.toHaveBeenCalled()
    for (const box of screen.getAllByRole('checkbox')) await user.click(box)
    await user.click(screen.getByRole('button', { name: 'Gửi duyệt lại' }))

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    const [url, form] = patch.mock.calls[0] as [string, FormData]
    expect(url).toBe(`/toys/${saved.id}`)
    expect(form.get('description')).toMatch(/đã chụp lại rõ từng mặt/)
    // A donation post never sends a listing type or a price (GB-09).
    expect(form.get('listingType')).toBeNull()
    expect(form.get('priceOrRate')).toBeNull()
    expect(
      await screen.findByText(`Đã lưu thay đổi. Tin #TF-${saved.id.slice(-5).toUpperCase()} đang chờ Quản trị viên duyệt.`),
    ).toBeInTheDocument()
  }, 30_000)
})

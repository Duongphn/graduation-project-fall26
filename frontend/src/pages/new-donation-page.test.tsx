import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Category } from '../features/toy-listings/toy-listing-api'
import { categoriesQuery } from '../features/toy-listings/toy-listing-queries'
import { PATHS } from '../routes/paths'
import { httpClient } from '../services/http-client'
import { createTestQueryClient, renderWithProviders } from '../test/render'
import { NewDonationPage } from './new-donation-page'

// No network: the axios instance is replaced; each test decides what the server answers.
vi.mock('../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

// The site header and footer (theme, account, notifications) are not part of this form.
vi.mock('../layouts/site/site-layout', () => ({
  SiteLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const get = vi.mocked(httpClient.get)
const post = vi.mocked(httpClient.post)

const WOOD: Category = { id: '64b000000000000000000001', name: 'Đồ chơi gỗ', slug: 'do-choi-go', parentId: null }
const CARS: Category = { id: '64b000000000000000000002', name: 'Xe điều khiển', slug: 'xe-dieu-khien', parentId: null }

// How httpClient (axios) rejects a backend error envelope.
const httpError = (status: number, code: string, message: string) =>
  new AxiosError(message, 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { success: false, error: { code, message } },
  })

const renderPage = () => {
  const queryClient = createTestQueryClient()
  // What newDonationLoader puts in the cache before the page renders.
  queryClient.setQueryData(categoriesQuery.queryKey, [WOOD, CARS])
  const router = createMemoryRouter([{ path: PATHS.newDonation, element: <NewDonationPage /> }], {
    initialEntries: [PATHS.newDonation],
  })
  renderWithProviders(<RouterProvider router={router} />, queryClient)
  return { user: userEvent.setup() }
}

const categoryField = () => screen.getByText('Danh mục phân loại').closest('.ant-form-item') as HTMLElement

const pickCategory = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(within(categoryField()).getByRole('combobox'))
  await user.click(await screen.findByTitle(name))
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Xác nhận & tạo phiếu quyên góp' }))

beforeAll(() => {
  // jsdom has no object URLs; the photo uploader previews the chosen files with them.
  URL.createObjectURL = () => 'blob:toy-photo'
  URL.revokeObjectURL = () => undefined
})

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  // GET /categories now lists WOOD only: an Admin hid "Xe điều khiển" after the page loaded.
  // Other GETs (organizations, header) are not needed here.
  get.mockImplementation(async (url) => {
    if (url === '/categories') return { data: [WOOD] }
    throw httpError(404, 'NOT_FOUND', 'Not found')
  })
})

describe('NewDonationPage', () => {
  it('reloads the categories and clears the choice when the server says the chosen one is no longer active', async () => {
    post.mockRejectedValueOnce(httpError(400, 'CATEGORY_NOT_FOUND', 'Category does not exist or is inactive'))
    const { user } = renderPage()

    await user.click(screen.getByPlaceholderText(/^VD: Bộ đồ chơi lắp ráp/))
    await user.paste('Bộ xe điều khiển địa hình')
    await pickCategory(user, CARS.name)
    await user.click(screen.getByRole('radio', { name: '3 - 6 tuổi (Mẫu giáo)' }))
    await user.click(screen.getByRole('radio', { name: /^Như mới/ }))
    await user.click(screen.getByPlaceholderText(/^Đồ chơi gồm những gì/))
    await user.paste('Xe chạy tốt, đủ điều khiển và bộ sạc, đã lau sạch, vỏ không nứt vỡ hay trầy xước.')
    await user.upload(screen.getByLabelText(/Kéo thả ảnh vào đây/), [
      new File(['1'], '1.jpg', { type: 'image/jpeg' }),
      new File(['2'], '2.jpg', { type: 'image/jpeg' }),
      new File(['3'], '3.jpg', { type: 'image/jpeg' }),
    ])
    for (const box of screen.getAllByRole('checkbox')) await user.click(box)
    await submit(user)

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect((post.mock.calls[0]?.[1] as FormData).get('categoryId')).toBe(CARS.id)
    // "Để ToyFlow ghép": the post stays open, no organization is sent (FE-02).
    expect((post.mock.calls[0]?.[1] as FormData).get('organizationId')).toBeNull()
    // The panel explains the refusal, and the category field asks for another category.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Danh mục đã chọn không còn hoạt động. Vui lòng chọn danh mục khác.',
    )
    expect(
      within(categoryField()).getByText('Danh mục vừa chọn không còn hoạt động, vui lòng chọn danh mục khác'),
    ).toBeInTheDocument()
    // The removed category is no longer selected: the select shows its placeholder.
    expect(within(categoryField()).getByText('Chọn danh mục')).toBeInTheDocument()
    expect(within(categoryField()).queryByText(CARS.name)).not.toBeInTheDocument()
    await waitFor(() => expect(get).toHaveBeenCalledWith('/categories'))

    // The next submit is blocked until a category is picked: the removed one is not sent again.
    await submit(user)
    expect(await within(categoryField()).findByText('Vui lòng chọn danh mục')).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(1)

    // The refetched list no longer offers the hidden category.
    await user.click(within(categoryField()).getByRole('combobox'))
    expect(await screen.findByTitle(WOOD.name)).toBeInTheDocument()
    expect(screen.queryByTitle(CARS.name)).not.toBeInTheDocument()
    await user.click(screen.getByTitle(WOOD.name))

    post.mockResolvedValueOnce({
      data: { success: true, data: { id: '64c000000000000000000001', title: 'Bộ xe điều khiển địa hình' } },
    })
    await submit(user)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    expect((post.mock.calls[1]?.[1] as FormData).get('categoryId')).toBe(WOOD.id)
    expect(await screen.findByText('Đã gửi phiếu quyên góp')).toBeInTheDocument()
  }, 30_000)

  it('shows the CONTACT_DETAILS_NOT_ALLOWED refusal under the description, and checks it before sending', async () => {
    post.mockRejectedValueOnce(
      new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {
          success: false,
          error: {
            code: 'CONTACT_DETAILS_NOT_ALLOWED',
            message: 'Không được ghi số điện thoại, email hoặc đường link trong mô tả.',
            details: { field: 'description' },
          },
        },
      }),
    )
    const { user } = renderPage()
    const descriptionField = () => screen.getByText('Mô tả đồ chơi').closest('.ant-form-item') as HTMLElement

    await user.click(screen.getByPlaceholderText(/^VD: Bộ đồ chơi lắp ráp/))
    await user.paste('Bộ xe điều khiển địa hình')
    await pickCategory(user, WOOD.name)
    await user.click(screen.getByRole('radio', { name: '3 - 6 tuổi (Mẫu giáo)' }))
    await user.click(screen.getByRole('radio', { name: /^Như mới/ }))
    const description = screen.getByPlaceholderText(/^Đồ chơi gồm những gì/)
    await user.click(description)
    await user.paste('Xe chạy tốt, đủ điều khiển và bộ sạc, đã lau sạch. Hỏi thêm qua 0912 345 678.')
    await user.upload(screen.getByLabelText(/Kéo thả ảnh vào đây/), [
      new File(['1'], '1.jpg', { type: 'image/jpeg' }),
      new File(['2'], '2.jpg', { type: 'image/jpeg' }),
      new File(['3'], '3.jpg', { type: 'image/jpeg' }),
    ])
    for (const box of screen.getAllByRole('checkbox')) await user.click(box)

    // The form refuses the phone number before sending.
    await submit(user)
    expect(
      await within(descriptionField()).findByText('Không được ghi số điện thoại, email hoặc đường link trong mô tả.'),
    ).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    // Whatever the server still refuses is shown under the same field.
    await user.clear(description)
    await user.click(description)
    await user.paste('Xe chạy tốt, đủ điều khiển và bộ sạc, đã lau sạch, vỏ không nứt vỡ hay trầy xước.')
    await submit(user)
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(
      await within(descriptionField()).findByText('Không được ghi số điện thoại, email hoặc đường link trong mô tả.'),
    ).toBeInTheDocument()
  }, 30_000)

  // UC33 steps 4-5: the chosen organization and handover method are sent as fields of the post (the
  // server creates the request to the organization once the Admin approves it), not as text added
  // to the description.
  it('sends the chosen organization and handover method with the post, not in the description', async () => {
    const organization = {
      id: '66a000000000000000000001',
      name: 'Mái ấm Hoa Sen',
      address: '12 Hàng Bài, Hà Nội',
      supportCriteria: 'Đồ chơi gỗ cho bé 3–6 tuổi',
      receivingPoint: null,
      ageGroups: [],
      categoryIds: [],
      areaProvince: null,
      isRemoteArea: false,
      isAccepting: true,
    }
    get.mockImplementation(async (url) => {
      if (url === '/categories') return { data: [WOOD] }
      if (url === '/organizations') {
        return { data: { data: [organization], pagination: { page: 1, limit: 12, totalItems: 1, totalPages: 1 } } }
      }
      throw httpError(404, 'NOT_FOUND', 'Not found')
    })
    post.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: '64c000000000000000000001',
          title: 'Bộ xe điều khiển địa hình',
          donationTarget: { organizationId: organization.id, handoverMethod: 'drop_off' },
        },
      },
    })
    const { user } = renderPage()
    const text = 'Xe chạy tốt, đủ điều khiển và bộ sạc, đã lau sạch, vỏ không nứt vỡ hay trầy xước.'

    await user.click(screen.getByPlaceholderText(/^VD: Bộ đồ chơi lắp ráp/))
    await user.paste('Bộ xe điều khiển địa hình')
    await pickCategory(user, WOOD.name)
    await user.click(screen.getByRole('radio', { name: '3 - 6 tuổi (Mẫu giáo)' }))
    await user.click(screen.getByRole('radio', { name: /^Như mới/ }))
    await user.click(screen.getByPlaceholderText(/^Đồ chơi gồm những gì/))
    await user.paste(text)
    await user.upload(screen.getByLabelText(/Kéo thả ảnh vào đây/), [
      new File(['1'], '1.jpg', { type: 'image/jpeg' }),
      new File(['2'], '2.jpg', { type: 'image/jpeg' }),
      new File(['3'], '3.jpg', { type: 'image/jpeg' }),
    ])
    for (const box of screen.getAllByRole('checkbox')) await user.click(box)
    await user.click(await screen.findByRole('radio', { name: /Mái ấm Hoa Sen/ }))
    await user.click(screen.getByRole('radio', { name: /Tự mang đến tận nơi/ }))
    await submit(user)

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    const form = post.mock.calls[0]?.[1] as FormData
    expect(form.get('organizationId')).toBe(organization.id)
    expect(form.get('handoverMethod')).toBe('drop_off')
    expect(form.get('description')).toBe(text)
    expect(await screen.findByText(/yêu cầu quyên góp tới Mái ấm Hoa Sen được tạo/)).toBeInTheDocument()
  }, 30_000)
})

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { httpClient } from '../../../services/http-client'
import { renderWithProviders } from '../../../test/render'
import type { Category, ToyListing } from '../toy-listing-api'
import { ToyListingForm } from './toy-listing-form'

// No network: the axios instance is replaced; each test decides what the server answers.
vi.mock('../../../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const patch = vi.mocked(httpClient.patch)

const WOOD: Category = { id: '64b000000000000000000001', name: 'Đồ chơi gỗ', slug: 'do-choi-go', parentId: null }
const CARS: Category = { id: '64b000000000000000000002', name: 'Xe điều khiển', slug: 'xe-dieu-khien', parentId: null }

// Posted in "Đồ chơi nhập vai", which an Admin hid afterwards: GET /categories no longer lists it.
const listing: ToyListing = {
  id: '64c000000000000000000001',
  ownerId: '64a000000000000000000001',
  categoryId: '64b000000000000000000003',
  categoryName: 'Đồ chơi nhập vai',
  title: 'Bộ đồ nấu ăn mini',
  description: 'Bộ đồ nấu ăn bằng gỗ đủ 20 món, đã vệ sinh sạch sẽ và còn nguyên hộp đựng.',
  condition: 'Như mới (90–99%)',
  listingType: 'rent',
  priceOrRate: 20_000,
  depositPrice: 300_000,
  ageRange: { minAge: 3, maxAge: 6 },
  // A rental has at least 3 photos (GB-10).
  images: [1, 2, 3].map((n) => ({ url: `https://cdn.test/${n}.jpg`, publicId: `toyflow/toys/${n}` })),
  quantity: 1,
  status: 'active',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

const renderForm = (props: Partial<ComponentProps<typeof ToyListingForm>> = {}) => {
  const onSaved = vi.fn()
  renderWithProviders(
    <MemoryRouter>
      <ToyListingForm
        listing={listing}
        categories={[WOOD, CARS]}
        categoriesLoading={false}
        categoriesLoaded
        onSaved={onSaved}
        {...props}
      />
    </MemoryRouter>,
  )
  return { onSaved, user: userEvent.setup() }
}

const categorySelect = () => screen.getByRole('combobox', { name: /^Danh mục/ })
const optionNames = () => Array.from((categorySelect() as HTMLSelectElement).options, (option) => option.text)
// The multipart body of the n-th PATCH /toys/:id.
const sentForm = (call = 0) => patch.mock.calls[call]?.[1] as FormData

beforeAll(() => {
  // jsdom has no object URLs; the photo uploader previews the chosen files with them.
  URL.createObjectURL = () => 'blob:toy-photo'
  URL.revokeObjectURL = () => undefined
})

beforeEach(() => {
  patch.mockReset()
})

const saveButton = () => screen.getByRole('button', { name: 'Lưu thay đổi' })
const photoErrors = () => screen.queryByRole('alert')

describe('ToyListingForm', () => {
  it('keeps a category the Admin hid after posting selected, and does not send it again', async () => {
    patch.mockResolvedValue({ data: { ...listing, title: 'Bộ đồ nấu ăn mini (mới)' } })
    const { onSaved, user } = renderForm()

    expect(categorySelect()).toHaveDisplayValue('Đồ chơi nhập vai (đã ẩn)')
    expect(optionNames()).toEqual(['Chọn danh mục', 'Đồ chơi gỗ', 'Xe điều khiển', 'Đồ chơi nhập vai (đã ẩn)'])

    await user.type(screen.getByRole('textbox', { name: /^Tên đồ chơi/ }), ' (mới)')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(patch).toHaveBeenCalledTimes(1)
    expect(patch.mock.calls[0]?.[0]).toBe(`/toys/${listing.id}`)
    expect(sentForm().get('title')).toBe('Bộ đồ nấu ăn mini (mới)')
    // Unchanged: the server keeps the toy's category, even though it is hidden now.
    expect(sentForm().has('categoryId')).toBe(false)
  })

  it('sends the category when the owner picks another one', async () => {
    patch.mockResolvedValue({ data: { ...listing, categoryId: CARS.id, categoryName: CARS.name } })
    const { onSaved, user } = renderForm()

    await user.selectOptions(categorySelect(), 'Xe điều khiển')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(sentForm().get('categoryId')).toBe(CARS.id)
  })

  it('names a category that no longer exists "Danh mục hiện tại"', () => {
    renderForm({ listing: { ...listing, categoryName: '' } })
    expect(categorySelect()).toHaveDisplayValue('Danh mục hiện tại (đã ẩn)')
  })

  it('adds no "(đã ẩn)" option for a category that is still active', () => {
    renderForm({ listing: { ...listing, categoryId: WOOD.id, categoryName: WOOD.name } })
    expect(categorySelect()).toHaveDisplayValue('Đồ chơi gỗ')
    expect(optionNames()).toEqual(['Chọn danh mục', 'Đồ chơi gỗ', 'Xe điều khiển'])
  })

  it('waits for GET /categories before it calls the saved category hidden', () => {
    renderForm({ categories: [], categoriesLoading: true, categoriesLoaded: false })
    expect(optionNames()).toEqual(['Đang tải danh mục...'])
  })
})

describe('ToyListingForm photo and price rules (GB-10, R03 III.3.1)', () => {
  it('asks for 3 photos for a rental and 4 for a sale before it saves (MSG21)', async () => {
    // Never approved yet, so its type can still change.
    const { user } = renderForm({ listing: { ...listing, status: 'pending' } })

    await user.click(screen.getByRole('button', { name: 'Xoá ảnh 3' }))
    await user.click(saveButton())
    expect(await screen.findByText('Vui lòng tải lên ít nhất 3 ảnh.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bán lại' }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Giá bán mong muốn/ }), { target: { value: '250000' } })
    await user.click(saveButton())
    expect(await screen.findByText('Vui lòng tải lên ít nhất 4 ảnh.')).toBeInTheDocument()
    expect(screen.getByText(/JPG, PNG hoặc WebP · tối đa 5 MB mỗi ảnh · từ 4 đến 8 ảnh/)).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
  })

  it('takes JPG, PNG and WebP photos only, at most 8', async () => {
    renderForm()
    // The file picker filters by `accept`; a dropped file is not filtered, so check without it.
    const user = userEvent.setup({ applyAccept: false })
    const input = screen.getByLabelText(/Kéo thả ảnh vào đây/)

    await user.upload(input, new File(['gif'], 'toy.gif', { type: 'image/gif' }))
    expect(
      within(photoErrors() as HTMLElement).getByText('"toy.gif" không phải ảnh JPG, PNG hoặc WebP.'),
    ).toBeInTheDocument()

    await user.upload(input, new File(['webp'], 'toy-4.webp', { type: 'image/webp' }))
    expect(screen.getAllByRole('img', { name: /^Ảnh đồ chơi/ })).toHaveLength(4)

    await user.upload(
      input,
      [5, 6, 7, 8, 9].map((n) => new File(['toy'], `toy-${n}.jpg`, { type: 'image/jpeg' })),
    )
    expect(screen.getByText('Chỉ đăng được tối đa 8 ảnh, đã bỏ qua "toy-9.jpg".')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /^Ảnh đồ chơi/ })).toHaveLength(8)
  })

  it('checks the daily price range and a deposit of at least one day', async () => {
    const { user } = renderForm()
    const price = screen.getByRole('textbox', { name: /^Giá thuê theo ngày/ })
    const deposit = screen.getByRole('textbox', { name: /^Tiền cọc bảo chứng/ })

    // The money inputs keep their formatted text; set the digits directly.
    fireEvent.change(price, { target: { value: '4000' } })
    await user.click(saveButton())
    expect(await screen.findByText('Giá phải từ 5.000 đ đến 5.000.000 đ')).toBeInTheDocument()

    fireEvent.change(price, { target: { value: '50000' } })
    fireEvent.change(deposit, { target: { value: '40000' } })
    await user.click(saveButton())
    expect(await screen.findByText('Tiền cọc tối thiểu bằng giá thuê một ngày')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
  })

  it('shows the photo minimum the server sends with TOO_FEW_PHOTOS', async () => {
    patch.mockRejectedValueOnce(
      new AxiosError('Please upload at least 4 photos.', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { error: { code: 'TOO_FEW_PHOTOS', message: 'Please upload at least 4 photos.', details: { min: 4, max: 8 } } },
      }),
    )
    const { user } = renderForm()

    await user.click(saveButton())
    expect(await screen.findByText('Vui lòng tải lên ít nhất 4 ảnh.')).toBeInTheDocument()
  })
})

describe('ToyListingForm and the Admin review (GB-08, GB-09)', () => {
  it('shows the rejection reason and sends the listing again', async () => {
    patch.mockResolvedValue({ data: { ...listing, status: 'pending', moderation: {} } })
    const { onSaved, user } = renderForm({
      listing: { ...listing, status: 'hidden', moderation: { rejectReason: 'Ảnh bị mờ, chụp lại giúp' } },
    })

    expect(screen.getByText('Ảnh bị mờ, chụp lại giúp')).toBeInTheDocument()
    // Never approved: the type can still change.
    expect(screen.getByRole('button', { name: 'Bán lại' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Gửi duyệt lại' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('says an approved listing waits for the Admin again and keeps its type', () => {
    renderForm()

    expect(screen.getByText(/Sau khi lưu, tin sẽ/)).toHaveTextContent(
      'Sau khi lưu, tin sẽ Chờ duyệt lại và tạm ẩn khỏi sàn cho đến khi Quản trị viên phê duyệt.',
    )
    expect(screen.getByRole('button', { name: 'Bán lại' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /Bán lại/ })).toBeDisabled()
    expect(screen.getByText('Tin đã được duyệt nên không đổi được loại tin.')).toBeInTheDocument()
  })

  it('keeps the type fixed after an approved listing was edited back to pending', () => {
    renderForm({ listing: { ...listing, status: 'pending', moderation: { reviewedAt: '2026-11-01T08:00:00.000Z' } } })
    expect(screen.getByRole('button', { name: 'Bán lại' })).toBeDisabled()
    expect(screen.queryByText(/Sau khi lưu, tin sẽ/)).not.toBeInTheDocument()
  })
})

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  images: [{ url: 'https://cdn.test/1.jpg', publicId: 'toyflow/toys/1' }],
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

beforeEach(() => {
  patch.mockReset()
})

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

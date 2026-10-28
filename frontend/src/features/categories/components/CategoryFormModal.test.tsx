import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../services/api-error'
import { deferred, renderWithProviders } from '../../../test/render'
import type { WithMessage } from '../../../types/api'
import { categoriesApi } from '../api'
import type { AdminCategory } from '../types'
import { CategoryFormModal } from './CategoryFormModal'

// No network: the feature api module is replaced; each test decides what the server answers.
vi.mock('../api', () => ({
  categoriesApi: { create: vi.fn(), update: vi.fn() },
}))

const create = vi.mocked(categoriesApi.create)
const update = vi.mocked(categoriesApi.update)

const category: AdminCategory = {
  id: '64b000000000000000000001',
  name: 'Đồ chơi gỗ',
  slug: 'do-choi-go',
  description: 'Gỗ tự nhiên',
  displayOrder: 3,
  status: 'active',
  toyCount: 0,
  canDelete: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const renderForm = (editing?: AdminCategory) => {
  const onClose = vi.fn()
  renderWithProviders(<CategoryFormModal open category={editing} onClose={onClose} />)
  return { onClose, user: userEvent.setup() }
}

const nameInput = () => screen.getByPlaceholderText('Ví dụ: Đồ chơi gỗ')

beforeEach(() => {
  create.mockReset()
  update.mockReset()
})

describe('CategoryFormModal', () => {
  it('sends one create request for a double click on OK', async () => {
    const pending = deferred<WithMessage<AdminCategory>>()
    create.mockReturnValue(pending.promise)
    const { onClose, user } = renderForm()
    await user.type(nameInput(), '  Xe   đạp ')

    const ok = screen.getByRole('button', { name: /Thêm/ })
    fireEvent.click(ok)
    fireEvent.click(ok)
    await user.type(nameInput(), '{Enter}')

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    // Sent normalised, like the server stores it.
    expect(create.mock.calls[0]?.[0]).toEqual({ name: 'Xe đạp' })

    pending.resolve({ data: { ...category, name: 'Xe đạp' }, message: 'Đã thêm danh mục.' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('sends nothing when the edit only changes spaces', async () => {
    const { onClose, user } = renderForm(category)
    await user.clear(nameInput())
    await user.type(nameInput(), '  Đồ   chơi gỗ  ')
    await user.click(screen.getByRole('button', { name: /Lưu/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(update).not.toHaveBeenCalled()
    expect(await screen.findByText('Không có thay đổi.')).toBeInTheDocument()
  })

  it('sends only the changed fields', async () => {
    update.mockResolvedValue({ data: { ...category, displayOrder: 7 } })
    const { onClose, user } = renderForm(category)
    const order = screen.getByPlaceholderText('Cuối danh sách')
    await user.clear(order)
    await user.type(order, '7')
    await user.click(screen.getByRole('button', { name: /Lưu/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0]?.[0]).toEqual({ id: category.id, input: { displayOrder: 7 } })
  })

  it('shows a duplicate name on the name field and keeps the form open', async () => {
    create.mockRejectedValue(
      new ApiError(409, 'CATEGORY_NAME_TAKEN', 'Danh mục đã tồn tại.', [
        { field: 'name', message: 'Tên danh mục đã được dùng.' },
      ]),
    )
    const { onClose, user } = renderForm()
    await user.type(nameInput(), 'Đồ chơi gỗ')
    await user.click(screen.getByRole('button', { name: /Thêm/ }))

    expect(await screen.findByText('Tên danh mục đã được dùng.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    // The form can be submitted again after the error.
    create.mockResolvedValue({ data: { ...category, name: 'Đồ chơi gỗ 2' } })
    await user.type(nameInput(), ' 2')
    await user.click(screen.getByRole('button', { name: /Thêm/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(create).toHaveBeenCalledTimes(2)
  })
})

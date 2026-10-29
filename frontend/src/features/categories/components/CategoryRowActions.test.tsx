import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { AdminCategory } from '../types'
import { CategoryRowActions } from './CategoryRowActions'

// No network: the row only renders here, nothing is sent.
vi.mock('../api', () => ({
  categoriesApi: { hide: vi.fn(), show: vi.fn(), remove: vi.fn() },
}))

const category: AdminCategory = {
  id: '64b000000000000000000001',
  name: 'Đồ chơi gỗ',
  slug: 'do-choi-go',
  displayOrder: 1,
  status: 'active',
  toyCount: 2,
  canDelete: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('CategoryRowActions', () => {
  it('gives keyboard and screen reader users the reason a used category cannot be deleted', async () => {
    renderWithProviders(<CategoryRowActions category={category} onEdit={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Xoá/ })).toBeDisabled()
    const reason = screen.getByRole('note', { name: 'Xoá: Danh mục đang có đồ chơi, chỉ có thể ẩn' })
    expect(reason).toHaveAttribute('tabindex', '0')
    // Tab reaches the reason after the two enabled buttons (Sửa, Ẩn).
    const user = userEvent.setup()
    await user.tab()
    await user.tab()
    await user.tab()
    expect(reason).toHaveFocus()
  })

  it('offers the delete button itself when no toy uses the category', () => {
    renderWithProviders(
      <CategoryRowActions category={{ ...category, toyCount: 0, canDelete: true }} onEdit={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: /Xoá/ })).toBeEnabled()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

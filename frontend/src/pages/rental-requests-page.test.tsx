import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpClient } from '../services/http-client'
import { renderWithProviders } from '../test/render'
import { RentalOrdersListPage } from './rental-requests-page'

vi.mock('../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
// The header and footer are not under test here.
vi.mock('../layouts/site/site-layout', () => ({ SiteLayout: ({ children }: { children: ReactNode }) => <>{children}</> }))

const get = vi.mocked(httpClient.get)

const renderList = (role: 'owner' | 'renter') => {
  const router = createMemoryRouter([{ path: '/rentals', element: <RentalOrdersListPage role={role} /> }], {
    initialEntries: ['/rentals'],
  })
  renderWithProviders(<RouterProvider router={router} />)
  return userEvent.setup()
}

beforeEach(() => {
  get.mockReset()
  get.mockResolvedValue({ data: { success: true, data: { items: [], total: 0, page: 1, limit: 10 } } })
})

// Review 20/11, rental bug 5: no tab for disputed and cancelled orders (UC16 filters by status).
describe('rental order lists: status tabs', () => {
  it.each(['owner', 'renter'] as const)('the %s list has "Đang khiếu nại", "Đã huỷ" and "Quá hạn" tabs', async (role) => {
    const user = renderList(role)
    for (const label of ['Đang khiếu nại', 'Đã huỷ', 'Quá hạn']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('tab', { name: 'Đang khiếu nại' }))
    expect(await screen.findByText('Không có đơn nào ở trạng thái “Đang khiếu nại”.')).toBeInTheDocument()
    expect(get).toHaveBeenLastCalledWith('/rentals', {
      params: expect.objectContaining({ role, status: 'DISPUTING' }),
    })
  })
})

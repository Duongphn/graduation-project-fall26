import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { adminMenuItems } from '../../routes/admin-menu'
import { adminPaths } from '../../routes/paths'
import { AdminLayout } from './AdminLayout'

const renderAt = (url: string) => {
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <p>Trang tổng quan</p> },
          { path: 'categories', element: <p>Trang danh mục</p> },
          { path: 'organizations', element: <p>Trang tổ chức</p> },
        ],
      },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
}

describe('AdminLayout', () => {
  it('shows every menu entry as a link to its page', async () => {
    renderAt(adminPaths.categories)
    expect(await screen.findByText('Trang danh mục')).toBeInTheDocument()
    expect(screen.getByText('Quản trị ToyFlow')).toBeInTheDocument()

    for (const item of adminMenuItems) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.path)
    }
  })

  it('opens the page of the clicked entry', async () => {
    renderAt(adminPaths.categories)
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Tổ chức từ thiện' }))
    expect(await screen.findByText('Trang tổ chức')).toBeInTheDocument()
  })
})

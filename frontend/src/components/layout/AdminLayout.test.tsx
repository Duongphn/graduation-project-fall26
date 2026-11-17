import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { theme } from 'antd'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '../../contexts/theme-provider'
import { adminMenuItems } from '../../routes/admin-menu'
import { adminPaths } from '../../routes/paths'
import { palette } from '../../styles/palette'
import { AdminLayout } from './AdminLayout'

// Reads the antd tokens that the admin pages, their modals and popconfirms get.
function TokenProbe() {
  const { token } = theme.useToken()
  return (
    <dl>
      <dt>colorText</dt>
      <dd data-testid="colorText">{token.colorText}</dd>
      <dt>colorBgElevated</dt>
      <dd data-testid="colorBgElevated">{token.colorBgElevated}</dd>
      <dt>colorBgContainer</dt>
      <dd data-testid="colorBgContainer">{token.colorBgContainer}</dd>
      <dt>colorTextLightSolid</dt>
      <dd data-testid="colorTextLightSolid">{token.colorTextLightSolid}</dd>
    </dl>
  )
}

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
          { path: 'tokens', element: <TokenProbe /> },
        ],
      },
    ],
    { initialEntries: [url] },
  )
  // The app-wide providers of main.tsx: the site theme (light or dark) around every route.
  render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
}

afterEach(() => document.documentElement.classList.remove('dark'))

describe('AdminLayout', () => {
  it('shows every menu entry as a link to its page', async () => {
    renderAt(adminPaths.categories)
    expect(await screen.findByText('Trang danh mục')).toBeInTheDocument()
    expect(screen.getByText('Quản trị ToyFlow')).toBeInTheDocument()

    for (const item of adminMenuItems) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.path)
    }
  })

  // R03 IV.2.1 Accessibility (contrast 4.5:1): the admin area keeps its light palette when the
  // visitor chose dark mode on the site, instead of mixing the admin's dark text with the dark
  // modal and popup backgrounds of the site's dark theme.
  it.each([false, true])('keeps the light admin theme when the site dark mode is %s', async (dark) => {
    document.documentElement.classList.toggle('dark', dark)
    renderAt('/admin/tokens')

    expect(await screen.findByTestId('colorText')).toHaveTextContent(palette.text)
    expect(screen.getByTestId('colorBgContainer')).toHaveTextContent(palette.surface)
    expect(screen.getByTestId('colorBgElevated')).toHaveTextContent('#ffffff')
    expect(screen.getByTestId('colorTextLightSolid')).toHaveTextContent('#fff')
  })

  it('opens the page of the clicked entry', async () => {
    renderAt(adminPaths.categories)
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Tổ chức từ thiện' }))
    expect(await screen.findByText('Trang tổ chức')).toBeInTheDocument()
  })
})

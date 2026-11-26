import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { theme } from 'antd'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../../contexts/theme-provider'
import { accountsApi } from '../../features/accounts/api'
import { identityVerificationsApi } from '../../features/identity-verifications/api'
import { toyModerationApi } from '../../features/toy-moderation/api'
import { violationReportsApi } from '../../features/violation-reports/api'
import { adminMenuItems } from '../../routes/admin-menu'
import { adminPaths } from '../../routes/paths'
import { palette } from '../../styles/palette'
import { renderWithProviders } from '../../test/render'
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


vi.mock('../../features/toy-moderation/api', () => ({
  toyModerationApi: { counts: vi.fn() },
}))
vi.mock('../../features/identity-verifications/api', () => ({
  identityVerificationsApi: { counts: vi.fn() },
}))
vi.mock('../../features/violation-reports/api', () => ({
  violationReportsApi: { counts: vi.fn() },
}))
vi.mock('../../features/accounts/api', () => ({
  accountsApi: { counts: vi.fn() },
}))

const toyCounts = vi.mocked(toyModerationApi.counts)
const identityCounts = vi.mocked(identityVerificationsApi.counts)
const reportCounts = vi.mocked(violationReportsApi.counts)
const accountCounts = vi.mocked(accountsApi.counts)

const renderLayout = () => {
  const router = createMemoryRouter(
    [{ path: '/admin', element: <AdminLayout />, children: [{ index: true, element: null }] }],
    { initialEntries: ['/admin'] },
  )
  renderWithProviders(<RouterProvider router={router} />)
}

const menuItem = (label: string) => screen.getByText(label).closest('li') as HTMLElement

beforeEach(() => {
  toyCounts.mockReset()
  identityCounts.mockReset()
  reportCounts.mockReset()
  reportCounts.mockResolvedValue({ pending: 0, resolved: 0, dismissed: 0 })
  toyCounts.mockResolvedValue({ pending: 0, active: 0, hidden: 0 })
  identityCounts.mockResolvedValue({ pending: 0, verified: 0, rejected: 0 })
  accountCounts.mockReset()
  accountCounts.mockResolvedValue({ all: 5, active: 5, locked: 0, reported: 0, trust_review: 0 })
})

describe('AdminLayout pending counters (L7)', () => {
  it('shows the pending listings and identity requests next to their menu entries', async () => {
    toyCounts.mockResolvedValue({ pending: 4, active: 20, hidden: 1 })
    identityCounts.mockResolvedValue({ pending: 2, verified: 9, rejected: 1 })
    renderLayout()

    expect(await screen.findByTitle('4 đang chờ duyệt')).toBeInTheDocument()
    expect(within(menuItem('Duyệt tin đăng')).getByTitle('4 đang chờ duyệt')).toBeInTheDocument()
    expect(
      within(menuItem('Xác minh danh tính')).getByTitle('2 đang chờ duyệt'),
    ).toBeInTheDocument()
    // Counted over every listing, not a filtered view.
    expect(toyCounts).toHaveBeenCalledWith({})
  })

  it('shows the pending violation reports next to their menu entry (UC29)', async () => {
    reportCounts.mockResolvedValue({ pending: 3, resolved: 5, dismissed: 1 })
    renderLayout()

    expect(
      await within(menuItem('Báo cáo vi phạm')).findByTitle('3 đang chờ duyệt'),
    ).toBeInTheDocument()
    expect(reportCounts).toHaveBeenCalledWith({})
  })

  it('shows the Renters blocked by a low Trust Score next to the users entry (UC29, FE-09)', async () => {
    accountCounts.mockResolvedValue({ all: 9, active: 8, locked: 1, reported: 2, trust_review: 2 })
    renderLayout()

    expect(
      await within(menuItem('Quản lý người dùng')).findByTitle('2 đang chờ duyệt'),
    ).toBeInTheDocument()
    // Counted over every account, not the filters of the list page.
    expect(accountCounts).toHaveBeenCalledWith({})
  })

  it('shows no counter when nothing is pending', async () => {
    toyCounts.mockResolvedValue({ pending: 0, active: 3, hidden: 0 })
    identityCounts.mockResolvedValue({ pending: 0, verified: 1, rejected: 0 })
    renderLayout()

    await vi.waitFor(() => expect(identityCounts).toHaveBeenCalled())
    expect(screen.queryByTitle(/đang chờ duyệt/)).not.toBeInTheDocument()
  })
})

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
  renderWithProviders(
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

// Admin review 20/11 #1: at 390 px the 240 px menu took most of the screen and the page scrolled
// sideways. Below the md breakpoint the menu is hidden and opens from the top bar.
describe('AdminLayout on a phone', () => {
  const originalMatchMedia = window.matchMedia
  beforeEach(() => {
    // Every max-width query matches, as on a 390 px screen.
    window.matchMedia = ((query: string) => ({
      ...originalMatchMedia(query),
      matches: query.includes('max-width'),
    })) as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  const sider = () => document.querySelector('.ant-layout-sider') as HTMLElement

  it('hides the menu and opens it from the menu button, then closes it after a pick', async () => {
    renderAt(adminPaths.categories)
    expect(await screen.findByText('Trang danh mục')).toBeInTheDocument()

    await vi.waitFor(() => expect(sider()).toHaveClass('ant-layout-sider-collapsed'))
    expect(sider().style.width).toBe('0px')

    const user = userEvent.setup()
    const toggle = screen.getByRole('button', { name: 'Mở menu quản trị' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(sider()).not.toHaveClass('ant-layout-sider-collapsed')
    expect(sider().style.width).toBe('240px')

    await user.click(screen.getByRole('link', { name: 'Tổ chức từ thiện' }))
    expect(await screen.findByText('Trang tổ chức')).toBeInTheDocument()
    expect(sider()).toHaveClass('ant-layout-sider-collapsed')
  })

  it('keeps the full menu on a wide screen', async () => {
    window.matchMedia = originalMatchMedia
    renderAt(adminPaths.categories)
    expect(await screen.findByText('Trang danh mục')).toBeInTheDocument()
    expect(sider()).not.toHaveClass('ant-layout-sider-collapsed')
    expect(screen.queryByRole('button', { name: 'Mở menu quản trị' })).not.toBeInTheDocument()
  })
})

// Admin review 20/11 #2: /admin/notifications and unknown /admin/... links lit up "Tổng quan".
describe('AdminLayout selected menu entry', () => {
  const renderSelected = (url: string) => {
    const page = (text: string) => <p>{text}</p>
    const router = createMemoryRouter(
      [
        {
          path: '/admin',
          element: <AdminLayout />,
          children: [
            { index: true, element: page('Trang tổng quan') },
            { path: 'toys/:id', element: page('Trang chi tiết tin') },
            { path: 'disputes', element: page('Trang khiếu nại') },
            { path: 'notifications', element: page('Trang thông báo') },
            { path: '*', element: page('Không tìm thấy trang') },
          ],
        },
      ],
      { initialEntries: [url] },
    )
    renderWithProviders(<RouterProvider router={router} />)
  }
  const selectedEntries = () =>
    [...document.querySelectorAll('.ant-menu-item-selected')].map((item) => item.textContent)

  it.each([
    ['/admin/notifications', 'Trang thông báo'],
    ['/admin/link-la', 'Không tìm thấy trang'],
  ])('selects no entry on %s', async (url, text) => {
    renderSelected(url)
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(selectedEntries()).toEqual([])
  })

  it.each([
    ['/admin', 'Trang tổng quan', 'Tổng quan'],
    ['/admin/', 'Trang tổng quan', 'Tổng quan'],
    ['/admin/toys/64b000000000000000000001', 'Trang chi tiết tin', 'Duyệt tin đăng'],
    ['/admin/disputes', 'Trang khiếu nại', 'Giải quyết khiếu nại'],
  ])('selects only the matching entry on %s', async (url, text, label) => {
    renderSelected(url)
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(selectedEntries()).toEqual([label])
  })
})

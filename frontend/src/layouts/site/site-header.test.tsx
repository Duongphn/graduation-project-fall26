import { screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../../contexts/theme-provider'
import { httpClient } from '../../services/http-client'
import { renderWithProviders } from '../../test/render'
import { SiteHeader } from './site-header'

// No network: the category menu (drawer) asks for categories.
vi.mock('../../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const renderHeaderAt = (url: string) => {
  const router = createMemoryRouter([{ path: '*', element: <SiteHeader /> }], { initialEntries: [url] })
  renderWithProviders(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return within(screen.getByRole('navigation', { name: 'Điều hướng chính' }))
}

const isCurrent = (nav: ReturnType<typeof renderHeaderAt>, name: string) =>
  nav.getByRole('link', { name }).getAttribute('aria-current') === 'page'

beforeEach(() => {
  vi.mocked(httpClient.get).mockResolvedValue({ data: { success: true, data: [] } } as never)
  localStorage.clear()
})

describe('Mục đang chọn ở menu header', () => {
  it('trang chủ: không mục nào sáng, kể cả "Quyên góp"', () => {
    const nav = renderHeaderAt('/')
    expect(isCurrent(nav, 'Quyên góp')).toBe(false)
    expect(nav.getByRole('link', { name: 'Quyên góp' })).not.toHaveClass('is-active')
    expect(isCurrent(nav, 'Thuê đồ chơi')).toBe(false)
  })

  it('"Quyên góp" chỉ sáng khi đang ở mục Đồ chơi quyên góp (/#do-choi-quyen-gop)', () => {
    const nav = renderHeaderAt('/#do-choi-quyen-gop')
    expect(isCurrent(nav, 'Quyên góp')).toBe(true)
  })

  it('/toys?type=sell: chỉ "Mua lại" sáng, không sáng cả "Thuê đồ chơi"', () => {
    const nav = renderHeaderAt('/toys?type=sell&page=2')
    expect(isCurrent(nav, 'Mua lại')).toBe(true)
    expect(isCurrent(nav, 'Thuê đồ chơi')).toBe(false)
  })
})

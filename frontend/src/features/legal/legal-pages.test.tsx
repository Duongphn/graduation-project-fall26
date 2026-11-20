import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { SiteFooter } from '../../layouts/site/site-footer'
import { PrivacyPage } from '../../pages/privacy-page'
import { TermsPage } from '../../pages/terms-page'
import { router as appRouter } from '../../routes/app-routes'
import { PATHS } from '../../routes/paths'
import { renderWithProviders } from '../../test/render'
import { RegisterForm } from '../auth/components/register-form'

// The site header (account, notifications, theme) is not part of these pages.
vi.mock('../../layouts/site/site-layout', () => ({
  SiteLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const renderAt = (path: string) => {
  const router = createMemoryRouter(
    [
      { path: PATHS.terms, element: <TermsPage /> },
      { path: PATHS.privacy, element: <PrivacyPage /> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
}

describe('Điều khoản dịch vụ và Chính sách bảo mật (R03 1.1.1 (8))', () => {
  it.each([PATHS.terms, PATHS.privacy])('%s có route riêng, không bị đưa về trang chủ', async (path) => {
    await appRouter.navigate(path)
    expect(appRouter.state.location.pathname).toBe(path)
    expect(appRouter.state.matches.at(-1)?.route.path).toBe(path)
  })

  it('trang Điều khoản có các mục tài khoản, xác minh, đặt cọc/ký quỹ, thuê, quyên góp và liên hệ', () => {
    renderAt(PATHS.terms)
    expect(screen.getByRole('heading', { level: 1, name: 'Điều khoản dịch vụ' })).toBeInTheDocument()
    for (const heading of [
      /Tài khoản/,
      /Xác minh danh tính/,
      /Ví, đặt cọc và ký quỹ/,
      /Quy định thuê và mua/,
      /Quy định quyên góp/,
      /Liên hệ/,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument()
    }
    expect(screen.getByText(/ToyFlow giữ số tiền này \(ký quỹ\)/)).toBeInTheDocument()
    const toc = screen.getByRole('navigation', { name: 'Mục lục' })
    expect(within(toc).getByRole('link', { name: /Quy định quyên góp/ })).toHaveAttribute('href', '#quy-dinh-quyen-gop')
    expect(screen.getByRole('link', { name: 'Chính sách bảo mật' })).toHaveAttribute('href', PATHS.privacy)
  })

  it('trang Chính sách nói rõ ai xem được ảnh CCCD và dữ liệu cá nhân', () => {
    renderAt(PATHS.privacy)
    expect(screen.getByRole('heading', { level: 1, name: 'Chính sách bảo mật' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /Ảnh CCCD và ảnh chân dung/ })).toBeInTheDocument()
    expect(screen.getByText(/Chỉ bạn và Admin đang duyệt hồ sơ mới mở được ảnh/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /Liên hệ/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Điều khoản dịch vụ' })).toHaveAttribute('href', PATHS.terms)
  })

  it('footer có link tới hai trang', () => {
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>,
    )
    const legal = screen.getByRole('navigation', { name: 'Pháp lý' })
    expect(within(legal).getByRole('link', { name: 'Điều khoản dịch vụ' })).toHaveAttribute('href', PATHS.terms)
    expect(within(legal).getByRole('link', { name: 'Chính sách bảo mật' })).toHaveAttribute('href', PATHS.privacy)
  })

  it('form đăng ký mở hai link ở tab mới để không mất dữ liệu đang điền', () => {
    renderWithProviders(
      <MemoryRouter>
        <RegisterForm onOtpSent={vi.fn()} />
      </MemoryRouter>,
    )
    for (const [name, href] of [
      ['Điều khoản dịch vụ', PATHS.terms],
      ['Chính sách bảo mật', PATHS.privacy],
    ]) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    }
  })
})

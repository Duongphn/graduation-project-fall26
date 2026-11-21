import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '../../contexts/theme-provider'
import { AccountLayout } from './account-layout'

afterEach(() => {
  document.documentElement.classList.remove('dark')
  localStorage.clear()
})

describe('Khu tài khoản có chế độ tối (R03 III.1.1.1 (2))', () => {
  it('thanh bên có nút đổi giao diện, bấm thì bật/tắt dark mode và nhớ lựa chọn', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AccountLayout activeItem="profile">
            <h1>Hồ sơ của tôi</h1>
          </AccountLayout>
        </MemoryRouter>
      </ThemeProvider>,
    )

    const sidebar = screen.getByRole('complementary')
    await user.click(within(sidebar).getByRole('button', { name: 'Chuyển sang giao diện tối' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('toyflow-theme')).toBe('dark')

    // Màn hẹp: thanh trên cùng cũng có nút
    const topbar = screen.getByRole('banner')
    await user.click(within(topbar).getByRole('button', { name: 'Chuyển sang giao diện sáng' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })
})

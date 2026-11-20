import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../../contexts/theme-provider'
import { RegisterPage } from '../../pages/register-page'
import { PATHS } from '../../routes/paths'
import { httpClient } from '../../services/http-client'
import { getAccessToken } from '../../services/token-storage'
import { renderWithProviders } from '../../test/render'

// No network: each test decides what the server answers.
vi.mock('../../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), defaults: { baseURL: '/api/v1' } },
}))

const post = vi.mocked(httpClient.post)
const ok = <T,>(data: T) => ({ data: { success: true, data } }) as never

const EMAIL = 'moi@example.com'
const SESSION = {
  user: { id: 'u1', email: EMAIL, fullName: 'Nguyễn Văn Mới', role: 'USER' },
  // Token USER (payload {"role":"USER"}) — chỉ dùng để đọc vai trò khi điều hướng
  tokens: { accessToken: 'h.eyJyb2xlIjoiVVNFUiJ9.s', refreshToken: 'refresh-1' },
}

/** Trang auth trong router nhỏ: `/` là trang chủ giả để biết đã chuyển tới đâu */
const renderAt = (element: ReactElement, path: string) => {
  const router = createMemoryRouter(
    [
      { path, element },
      { path: PATHS.home, element: <p>Trang chủ</p> },
      { path: PATHS.login, element: <p>Trang đăng nhập</p> },
    ],
    { initialEntries: [path] },
  )
  renderWithProviders(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  )
  return router
}

const fillRegisterForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Họ và tên'), 'Nguyễn Văn Mới')
  await user.type(screen.getByLabelText('Số điện thoại'), '0912345670')
  await user.type(screen.getByLabelText('Email'), EMAIL)
  await user.type(screen.getByLabelText('Mật khẩu'), 'Test@1234')
  await user.type(screen.getByLabelText('Nhập lại mật khẩu'), 'Test@1234')
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: /Tiếp tục/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('Đăng ký xong được đăng nhập và mở trang chủ (R03 UC01 bước 5)', () => {
  it('lưu phiên và chuyển về trang chủ, không về trang đăng nhập', async () => {
    const user = userEvent.setup()
    post.mockImplementation(async (url: string) => {
      if (url === '/auth/register') return ok({ email: EMAIL, resendAfterSeconds: 60 })
      if (url === '/auth/register/verify-otp') return ok(SESSION)
      throw new Error(`unexpected ${url}`)
    })
    const router = renderAt(<RegisterPage />, PATHS.register)

    await fillRegisterForm(user)
    const firstBox = (await screen.findAllByRole('textbox')).find((box) => box.closest('.otp-input'))!
    await user.type(firstBox, '123456')
    await user.click(screen.getByRole('button', { name: 'Xác minh và tạo tài khoản' }))

    expect(await screen.findByText('Trang chủ')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(PATHS.home)
    expect(post).toHaveBeenCalledWith('/auth/register/verify-otp', { email: EMAIL, otpCode: '123456' })
    await waitFor(() => expect(getAccessToken()).toBe(SESSION.tokens.accessToken))
  })
})

import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../../contexts/theme-provider'
import { OtpVerificationForm } from './components/otp-verification-form'
import { savePendingRegistration } from './pending-registration'
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

const otpBoxes = () => screen.getAllByRole('textbox').filter((box) => box.closest('.otp-input'))
const findOtpBox = async (index: number) => {
  await screen.findByText('Mã xác minh')
  return otpBoxes()[index]
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
    // Đủ 6 số thì tự gửi mã, không cần bấm nút
    await user.type(await findOtpBox(0), '123456')

    expect(await screen.findByText('Trang chủ')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(PATHS.home)
    expect(post).toHaveBeenCalledWith('/auth/register/verify-otp', { email: EMAIL, otpCode: '123456' })
    await waitFor(() => expect(getAccessToken()).toBe(SESSION.tokens.accessToken))
  })
})

describe('Màn nhập OTP theo R03 III.1.1.1 (12)–(14)', () => {
  const renderOtp = (verify: (otp: string) => Promise<unknown>) =>
    renderWithProviders(
      <OtpVerificationForm
        destination="mo***@example.com"
        resendAfterSeconds={60}
        verify={verify}
        resend={async () => ({ resendAfterSeconds: 60 })}
        onVerified={vi.fn()}
        submitLabel="Xác minh và tạo tài khoản"
        backLabel="Sửa thông tin đăng ký"
        onBack={vi.fn()}
      />,
    )

  it('nút xác minh tắt khi chưa đủ 6 số; đủ 6 số thì tự gửi mã', async () => {
    const user = userEvent.setup()
    const verify = vi.fn(async () => ({}))
    renderOtp(verify)

    const submit = screen.getByRole('button', { name: 'Xác minh và tạo tài khoản' })
    expect(submit).toBeDisabled()
    await user.type(otpBoxes()[0], '12345')
    expect(submit).toBeDisabled()
    expect(verify).not.toHaveBeenCalled()

    await user.type(otpBoxes()[5], '6')
    await waitFor(() => expect(verify).toHaveBeenCalledWith('123456'))
    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('mã sai: báo lỗi ngay dưới ô và xoá các ô để nhập lại', async () => {
    const user = userEvent.setup()
    const verify = vi.fn(async () => {
      throw Object.assign(new Error('bad'), {
        isAxiosError: true,
        response: { status: 400, data: { success: false, error: { code: 'INVALID_OTP', message: 'Mã OTP không chính xác hoặc đã hết hạn.' } } },
      })
    })
    renderOtp(verify)

    await user.type(otpBoxes()[0], '111111')
    expect(await screen.findByText('Mã OTP không chính xác hoặc đã hết hạn.')).toBeInTheDocument()
    await waitFor(() => otpBoxes().forEach((box) => expect(box).toHaveValue('')))
    expect(screen.getByRole('button', { name: 'Xác minh và tạo tài khoản' })).toBeDisabled()
  })

  it('đếm ngược hạn mã 5 phút', () => {
    vi.useFakeTimers()
    try {
      renderOtp(vi.fn())
      expect(screen.getByRole('timer')).toHaveTextContent('Mã hết hạn sau 5:00')
      // Mỗi giây một lần cập nhật (setTimeout nối tiếp)
      for (let second = 0; second < 61; second++) act(() => vi.advanceTimersByTime(1000))
      expect(screen.getByRole('timer')).toHaveTextContent('Mã hết hạn sau 3:59')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Tải lại trang ở bước nhập OTP vẫn ở bước OTP', () => {
  it('mở lại /register hiện bước 2 với email đã che; quay lại bước 1 giữ thông tin, không giữ mật khẩu', async () => {
    const user = userEvent.setup()
    savePendingRegistration(
      { email: EMAIL, resendAfterSeconds: 60 },
      { fullName: 'Nguyễn Văn Mới', phone: '0912345670', email: EMAIL, password: 'Test@1234', confirmPassword: 'Test@1234', acceptTerms: true },
    )
    expect(sessionStorage.getItem('toyflow-pending-registration')).not.toContain('Test@1234')

    renderAt(<RegisterPage />, PATHS.register)

    const notice = await screen.findByText(/đã được gửi tới/)
    expect(within(notice).getByText('mo***@example.com')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent(/Mã hết hạn sau [45]:\d\d/)

    await user.click(screen.getByRole('button', { name: /Sửa thông tin đăng ký/ }))
    expect(screen.getByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn Mới')
    expect(screen.getByLabelText('Email')).toHaveValue(EMAIL)
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('')
    expect(sessionStorage.getItem('toyflow-pending-registration')).toBeNull()
  })
})

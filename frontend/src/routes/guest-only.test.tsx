import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { GuestOnly } from './guest-only'
import { ADMIN_ROOT, PATHS } from './paths'

// Access token có claim role (chỉ phần payload được đọc để điều hướng)
const tokenFor = (role: 'USER' | 'ADMIN') => `h.${btoa(JSON.stringify({ role }))}.s`

const renderAt = (url: string) => {
  const router = createMemoryRouter(
    [
      { path: PATHS.login, element: <GuestOnly><p>Form đăng nhập</p></GuestOnly> },
      { path: PATHS.register, element: <GuestOnly><p>Form đăng ký</p></GuestOnly> },
      { path: PATHS.home, element: <p>Trang chủ</p> },
      { path: ADMIN_ROOT, element: <p>Khu quản trị</p> },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('Người đã đăng nhập không mở lại /login, /register', () => {
  it('khách vẫn thấy form đăng nhập và đăng ký', () => {
    renderAt(PATHS.login)
    expect(screen.getByText('Form đăng nhập')).toBeInTheDocument()
  })

  it('User đã đăng nhập mở /login hoặc /register thì về trang chủ', () => {
    localStorage.setItem('toyflow-access-token', tokenFor('USER'))
    const router = renderAt(PATHS.login)
    expect(screen.getByText('Trang chủ')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(PATHS.home)
  })

  it('User đăng nhập không ghi nhớ (sessionStorage) mở /register cũng về trang chủ', () => {
    sessionStorage.setItem('toyflow-access-token', tokenFor('USER'))
    renderAt(PATHS.register)
    expect(screen.getByText('Trang chủ')).toBeInTheDocument()
  })

  it('Admin đã đăng nhập mở /login thì về khu quản trị', () => {
    localStorage.setItem('toyflow-access-token', tokenFor('ADMIN'))
    const router = renderAt(PATHS.login)
    expect(screen.getByText('Khu quản trị')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(ADMIN_ROOT)
  })
})

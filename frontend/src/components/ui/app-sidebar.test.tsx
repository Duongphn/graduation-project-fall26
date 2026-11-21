import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { PATHS } from '../../routes/paths'
import { SessionButton } from './app-sidebar'

function LoginProbe() {
  const state = useLocation().state as { from?: string } | null
  return <p>Đăng nhập rồi quay lại: {state?.from ?? '(không có)'}</p>
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('Nút Đăng nhập ở thanh bên (R03 III.1.2.1 (8))', () => {
  it('khách bấm Đăng nhập ở trang chi tiết đồ chơi: trang đăng nhập nhớ trang đó', async () => {
    const router = createMemoryRouter(
      [
        { path: PATHS.toyDetail, element: <SessionButton /> },
        { path: PATHS.login, element: <LoginProbe /> },
      ],
      { initialEntries: ['/toys/toy-1?tab=info'] },
    )
    render(<RouterProvider router={router} />)

    await userEvent.setup().click(screen.getByRole('link', { name: 'Đăng nhập' }))

    expect(await screen.findByText('Đăng nhập rồi quay lại: /toys/toy-1?tab=info')).toBeInTheDocument()
  })
})

import { act, render, screen } from '@testing-library/react'
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useLocation,
  type LoaderFunction,
} from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getCurrentRole } from '../services/current-role'
import { adminRoute } from './router'

vi.mock('../services/current-role', () => ({ getCurrentRole: vi.fn() }))

const currentRole = vi.mocked(getCurrentRole)
const requireAdmin = adminRoute.loader as LoaderFunction

// The guard returns the redirect (a 302 Response) or null.
const runLoader = async (url: string) =>
  requireAdmin({
    request: new Request(`http://localhost${url}`),
    params: {},
    context: undefined,
  } as unknown as Parameters<LoaderFunction>[0])

function LoginProbe() {
  const { search } = useLocation()
  return <p>Trang đăng nhập {new URLSearchParams(search).get('redirect')}</p>
}

// The guard and the revalidation rule of adminRoute on a small route tree (no AdminLayout).
const renderAt = (url: string) => {
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        loader: requireAdmin,
        ...(adminRoute.shouldRevalidate ? { shouldRevalidate: adminRoute.shouldRevalidate } : {}),
        element: (
          <>
            <p>Khu quản trị</p>
            <Outlet />
          </>
        ),
        children: [
          { path: 'categories', element: <p>Danh mục</p> },
          { path: 'organizations', element: <p>Tổ chức</p> },
        ],
      },
      { path: '/login', element: <LoginProbe /> },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => currentRole.mockReset())

describe('admin route guard', () => {
  it.each([null, 'USER'] as const)('sends role %s to the login page with ?redirect=', async (role) => {
    currentRole.mockReturnValue(role)
    const response = (await runLoader('/admin/categories?page=2')) as Response
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(
      `/login?redirect=${encodeURIComponent('/admin/categories?page=2')}`,
    )
  })

  it('lets an ADMIN in', async () => {
    currentRole.mockReturnValue('ADMIN')
    await expect(runLoader('/admin/categories')).resolves.toBeNull()
  })

  it('lands a signed-out visitor on the login page, keeping the requested page', async () => {
    currentRole.mockReturnValue(null)
    renderAt('/admin/categories?status=hidden')
    expect(
      await screen.findByText('Trang đăng nhập /admin/categories?status=hidden'),
    ).toBeInTheDocument()
  })

  it('checks the role again when the Admin moves to another admin page', async () => {
    currentRole.mockReturnValue('ADMIN')
    const router = renderAt('/admin/categories')
    expect(await screen.findByText('Danh mục')).toBeInTheDocument()

    // Signed out in another tab: the next admin page goes to the login page.
    currentRole.mockReturnValue(null)
    await act(() => router.navigate('/admin/organizations'))
    expect(await screen.findByText('Trang đăng nhập /admin/organizations')).toBeInTheDocument()
  })
})

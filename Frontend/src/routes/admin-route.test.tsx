import { render, screen } from '@testing-library/react'
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  type LoaderFunction,
} from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getCurrentRole } from '../services/current-role'
import { adminRoute } from './admin-route'

vi.mock('../services/current-role', () => ({ getCurrentRole: vi.fn() }))

const currentRole = vi.mocked(getCurrentRole)
const requireAdmin = adminRoute.loader as LoaderFunction

// The loader throws the redirect synchronously; async turns it into a rejection.
const runLoader = async (url: string) =>
  requireAdmin({
    request: new Request(`http://localhost${url}`),
    url: new URL(`http://localhost${url}`),
    params: {},
    pattern: '/admin/*',
    context: undefined,
  } as unknown as Parameters<LoaderFunction>[0])

function LoginProbe() {
  const { search } = useLocation()
  return <p>Trang đăng nhập {new URLSearchParams(search).get('redirect')}</p>
}

const renderAt = (url: string) => {
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        loader: requireAdmin,
        element: <p>Khu quản trị</p>,
        children: [{ path: '*', element: null }],
      },
      { path: '/login', element: <LoginProbe /> },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
}

beforeEach(() => currentRole.mockReset())

describe('admin route loader', () => {
  it.each([undefined, 'USER'])('sends role %s to the login page with ?redirect=', async (role) => {
    currentRole.mockReturnValue(role)
    const response = await runLoader('/admin/categories?page=2').then(
      () => undefined,
      (thrown: unknown) => thrown as Response,
    )
    expect(response?.status).toBe(302)
    expect(response?.headers.get('Location')).toBe(
      `/login?redirect=${encodeURIComponent('/admin/categories?page=2')}`,
    )
  })

  it('lets an ADMIN in', async () => {
    currentRole.mockReturnValue('ADMIN')
    await expect(runLoader('/admin/categories')).resolves.toBeNull()
  })

  it('lands a signed-out visitor on the login page, keeping the requested page', async () => {
    currentRole.mockReturnValue(undefined)
    renderAt('/admin/categories?status=HIDDEN')
    expect(
      await screen.findByText('Trang đăng nhập /admin/categories?status=HIDDEN'),
    ).toBeInTheDocument()
  })

  it('renders the admin area for an ADMIN', async () => {
    currentRole.mockReturnValue('ADMIN')
    renderAt('/admin/categories')
    expect(await screen.findByText('Khu quản trị')).toBeInTheDocument()
  })
})

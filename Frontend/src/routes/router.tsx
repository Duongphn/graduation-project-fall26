import { Result, Skeleton } from 'antd'
import { redirect, type RouteObject } from 'react-router-dom'

import { AdminLayout } from '../components/layout/AdminLayout'
import { adminRoutes } from './admin-routes'
import { getCurrentRole } from '../services/current-role'
import { ADMIN_ROOT, PATHS } from './paths'

// The admin area (/admin/*). Mounted in app-routes.tsx next to the user pages.
export const adminRoute: RouteObject = {
  path: ADMIN_ROOT,
  // Only an Admin enters /admin; anyone else goes to the login page and comes back after it.
  loader: ({ request }) => {
    if (getCurrentRole() === 'ADMIN') return null
    const url = new URL(request.url)
    return redirect(`${PATHS.login}?redirect=${encodeURIComponent(url.pathname + url.search)}`)
  },
  element: <AdminLayout />,
  // Shown while the first lazy page of a direct visit loads.
  hydrateFallbackElement: <Skeleton active className="p-6" />,
  children: [
    {
      index: true,
      element: (
        <Result status="info" title="ToyFlow Admin" subTitle="Chọn chức năng ở menu bên trái." />
      ),
    },
    ...adminRoutes,
  ],
}

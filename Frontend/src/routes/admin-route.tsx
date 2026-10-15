import { Result, Skeleton } from 'antd'
import { redirect, type LoaderFunctionArgs, type RouteObject } from 'react-router-dom'

import { AdminLayout } from '../components/layout/AdminLayout'
import { getCurrentRole } from '../services/current-role'
import { adminRoutes } from './admin-routes'
import { ADMIN_ROOT, PATHS } from './paths'

// Only a signed-in ADMIN opens /admin/*: everyone else goes to the login page. In development the
// dev-auth user (VITE_DEV_USER_ID + VITE_DEV_ROLE=ADMIN) counts as signed in.
// The login page brings the user back to the requested page (?redirect=/admin/...).
const requireAdmin = ({ request }: LoaderFunctionArgs) => {
  if (getCurrentRole() === 'ADMIN') return null
  const { pathname, search } = new URL(request.url)
  throw redirect(`${PATHS.login}?${new URLSearchParams({ redirect: pathname + search })}`)
}

// The admin area (/admin/*). Mounted in app-routes.tsx next to the user pages.
export const adminRoute: RouteObject = {
  path: ADMIN_ROOT,
  loader: requireAdmin,
  // Re-check on every admin navigation (e.g. after logging out in another tab).
  shouldRevalidate: () => true,
  element: <AdminLayout />,
  // Shown while the first lazy page of a direct visit loads.
  hydrateFallbackElement: <Skeleton active className="p-6" />,
  children: [
    {
      index: true,
      element: (
        <Result status="info" title="Quản trị ToyFlow" subTitle="Chọn chức năng ở menu bên trái." />
      ),
    },
    ...adminRoutes,
  ],
}

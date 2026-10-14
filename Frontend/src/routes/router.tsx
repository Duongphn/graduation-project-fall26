import { Result, Skeleton } from 'antd'
import type { RouteObject } from 'react-router-dom'

import { AdminLayout } from '../components/layout/AdminLayout'
import { adminRoutes } from './admin-routes'
import { ADMIN_ROOT } from './paths'

// The admin area (/admin/*). Mounted in app-routes.tsx next to the user pages.
export const adminRoute: RouteObject = {
  path: ADMIN_ROOT,
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

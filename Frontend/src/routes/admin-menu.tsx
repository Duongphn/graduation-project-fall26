import {
  AppstoreOutlined,
  DashboardOutlined,
  HeartOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'

import { adminPaths } from './paths'

export interface AdminMenuItem {
  key: string
  label: string
  icon: ReactNode
  path: string
}

// Left menu of the admin area. Each feature adds one line here (and its route block in
// admin-routes.tsx); import every icon in the single @ant-design/icons import above.
export const adminMenuItems: AdminMenuItem[] = [
  { key: 'dashboard', label: 'Tổng quan', icon: <DashboardOutlined />, path: adminPaths.dashboard },
  { key: 'categories', label: 'Danh mục đồ chơi', icon: <AppstoreOutlined />, path: adminPaths.categories },
  { key: 'organizations', label: 'Tổ chức từ thiện', icon: <HeartOutlined />, path: adminPaths.organizations },
]

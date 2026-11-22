import {
  AppstoreOutlined,
  AuditOutlined,
  DashboardOutlined,
  GiftOutlined,
  HeartOutlined,
  HistoryOutlined,
  IdcardOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'

import { adminPaths } from './paths'

// Menu entries that show how many items wait for an Admin (useAdminPendingCounts).
export type AdminPendingCounter = 'toys' | 'identityVerifications' | 'violationReports'

export interface AdminMenuItem {
  key: string
  label: string
  icon: ReactNode
  path: string
  pendingCounter?: AdminPendingCounter
}

// Left menu of the admin area. Each feature adds one line here (and its route block in
// admin-routes.tsx); import every icon in the single @ant-design/icons import above.
export const adminMenuItems: AdminMenuItem[] = [
  { key: 'dashboard', label: 'Tổng quan', icon: <DashboardOutlined />, path: adminPaths.dashboard },
  { key: 'toys', label: 'Duyệt tin đăng', icon: <AuditOutlined />, path: adminPaths.toys, pendingCounter: 'toys' },
  { key: 'identity-verifications', label: 'Xác minh danh tính', icon: <IdcardOutlined />, path: adminPaths.identityVerifications, pendingCounter: 'identityVerifications' },
  { key: 'categories', label: 'Danh mục đồ chơi', icon: <AppstoreOutlined />, path: adminPaths.categories },
  { key: 'organizations', label: 'Tổ chức từ thiện', icon: <HeartOutlined />, path: adminPaths.organizations },
  { key: 'disputes', label: 'Giải quyết khiếu nại', icon: <SafetyCertificateOutlined />, path: adminPaths.disputes },
  { key: 'donation-requests', label: 'Yêu cầu nhận tặng', icon: <GiftOutlined />, path: adminPaths.donationRequests },
  { key: 'violation-reports', label: 'Báo cáo vi phạm', icon: <WarningOutlined />, path: adminPaths.violationReports, pendingCounter: 'violationReports' },
  { key: 'users', label: 'Quản lý người dùng', icon: <TeamOutlined />, path: adminPaths.users },
  { key: 'audit-logs', label: 'Nhật ký hệ thống', icon: <HistoryOutlined />, path: adminPaths.auditLogs },
]

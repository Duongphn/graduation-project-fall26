import { useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { getCurrentRole } from '../services/current-role'
import { getAccessToken } from '../services/token-storage'
import { ADMIN_ROOT, PATHS } from './paths'

/**
 * Trang chỉ dành cho khách (đăng nhập, đăng ký): người đã đăng nhập được đưa về trang của mình —
 * User về trang chủ, Admin về /admin (R03 III.1.2.1 (8)).
 * Chỉ xét lúc mở trang: khi chính trang này vừa đăng nhập xong, trang tự điều hướng tới đích.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const [signedInOnOpen] = useState(() => getAccessToken() !== null)

  if (signedInOnOpen) {
    return <Navigate to={getCurrentRole() === 'ADMIN' ? ADMIN_ROOT : PATHS.home} replace />
  }

  return children
}

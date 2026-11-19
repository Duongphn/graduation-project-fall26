import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useIsSignedIn } from '../hooks/use-is-signed-in'
import { getCurrentRole } from '../services/current-role'
import { ADMIN_ROOT, PATHS } from './paths'

/**
 * Trang cần đăng nhập (đăng tin, tin của tôi…): khách được chuyển sang trang đăng nhập,
 * đăng nhập xong LoginPage đưa về đúng trang đang định vào (`state.from`).
 * Admin không có hồ sơ, tin đăng hay đơn thuê (API trả 403), nên được đưa về khu /admin.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const isSignedIn = useIsSignedIn()
  const location = useLocation()

  if (!isSignedIn) {
    return <Navigate to={PATHS.login} replace state={{ from: location.pathname + location.search }} />
  }

  if (getCurrentRole() === 'ADMIN') return <Navigate to={ADMIN_ROOT} replace />

  return children
}

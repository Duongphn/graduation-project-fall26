import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../features/auth/components/auth-layout'
import { LoginForm } from '../features/auth/components/login-form'
import { PATHS } from '../routes/paths'
import { saveSession } from '../services/token-storage'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as { from?: string } | null)?.from ?? PATHS.home

  return (
    <AuthLayout
      pageTitle="Đăng nhập"
      brand={{
        eyebrow: 'Chào mừng bạn quay lại',
        lead: 'Đăng nhập để thuê đồ, theo dõi đơn hàng, ví và tiền cọc của bạn.',
      }}
    >
      <header className="auth-panel__header">
        <h2 className="auth-panel__title">Đăng nhập</h2>
        <p className="auth-panel__subtitle">
          Chưa có tài khoản?{' '}
          <Link to={PATHS.register} className="text-link">
            Đăng ký miễn phí
          </Link>
        </p>
      </header>

      <LoginForm
        onSuccess={(session, rememberMe) => {
          saveSession(session, rememberMe)
          navigate(redirectTo, { replace: true })
        }}
      />
    </AuthLayout>
  )
}

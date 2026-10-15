import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../features/auth/components/auth-layout'
import { LoginForm } from '../features/auth/components/login-form'
import { PATHS } from '../routes/paths'
import { saveAccessToken } from '../services/token-storage'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // ?redirect= comes from route guards (e.g. /admin); only same-site paths are followed.
  const redirectParam = searchParams.get('redirect')
  const safeRedirect =
    redirectParam?.startsWith('/') && !redirectParam.startsWith('//') ? redirectParam : undefined
  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? safeRedirect ?? PATHS.home

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
        onSuccess={({ accessToken }, rememberMe) => {
          saveAccessToken(accessToken, rememberMe)
          navigate(redirectTo, { replace: true })
        }}
      />
    </AuthLayout>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Alert, Spin } from 'antd'
import { useCallback, useEffect } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  exchangeGoogleLoginCode,
  GOOGLE_OTP_RESEND_SECONDS,
  resendGoogleOtp,
  verifyGoogleOtp,
  type AuthTokens,
} from '../features/auth/auth-api'
import { AuthLayout } from '../features/auth/components/auth-layout'
import { LoginForm } from '../features/auth/components/login-form'
import { OtpVerificationForm } from '../features/auth/components/otp-verification-form'
import { PATHS } from '../routes/paths'
import { getApiErrorMessage } from '../services/http-client'
import { saveAuthTokens } from '../services/token-storage'
import { maskEmail } from '../utils/mask-contact'

/** State các trang khác có thể truyền khi điều hướng tới trang đăng nhập */
export interface LoginPageState {
  from?: string
  /** Có giá trị khi vừa đăng ký thành công — dùng để hiện thông báo và điền sẵn email */
  registeredIdentifier?: string
}

/** Mã lỗi backend gắn vào `?error=` khi chuyển hướng về sau bước đăng nhập Google */
const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  no_code: 'Bạn đã huỷ đăng nhập Google hoặc Google không trả về mã xác thực.',
  no_id_token: 'Google không trả về thông tin tài khoản. Vui lòng thử lại.',
  GOOGLE_EMAIL_UNVERIFIED: 'Email của tài khoản Google này chưa được Google xác minh.',
  USER_INACTIVE: 'Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động.',
  USER_LOCKED: 'Tài khoản của bạn đang bị khóa tạm thời.',
  MAIL_SEND_FAILED: 'Không thể gửi mã xác minh tới Gmail của bạn. Vui lòng thử lại sau.',
  google_auth_failed: 'Đăng nhập Google thất bại. Vui lòng thử lại sau.',
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const state = location.state as LoginPageState | null
  // ?redirect= comes from route guards (e.g. /admin); only same-site paths are followed.
  const redirectParam = searchParams.get('redirect')
  const safeRedirect =
    redirectParam?.startsWith('/') && !redirectParam.startsWith('//') ? redirectParam : undefined
  const redirectTo = state?.from ?? safeRedirect ?? PATHS.home
  const registeredIdentifier = state?.registeredIdentifier

  // Sau khi Google xác thực, backend chuyển về một trong hai dạng:
  // - Gmail đã đăng ký:  /login?googleCode=...                   → đổi mã lấy phiên, vào thẳng
  // - Gmail chưa đăng ký: /login?step=otp&tempToken=...&email=... → nhập OTP để tạo tài khoản
  const googleCode = searchParams.get('googleCode')
  const googleTempToken = searchParams.get('step') === 'otp' ? searchParams.get('tempToken') : null
  const googleEmail = searchParams.get('email') ?? ''
  const googleErrorCode = searchParams.get('error')
  const googleError = googleErrorCode && (GOOGLE_ERROR_MESSAGES[googleErrorCode] ?? GOOGLE_ERROR_MESSAGES.google_auth_failed)

  // useQuery thay vì gọi trong useEffect: StrictMode mount 2 lần sẽ không gửi trùng (mã chỉ dùng được một lần)
  const googleExchange = useQuery({
    queryKey: ['google-login-exchange', googleCode],
    queryFn: () => exchangeGoogleLoginCode(googleCode!),
    enabled: !!googleCode,
    retry: false,
    staleTime: Infinity,
  })

  const completeLogin = useCallback(
    (tokens: AuthTokens, rememberMe: boolean) => {
      saveAuthTokens(tokens, rememberMe)
      navigate(redirectTo, { replace: true })
    },
    [navigate, redirectTo],
  )

  useEffect(() => {
    if (googleExchange.data) completeLogin(googleExchange.data.tokens, true)
  }, [googleExchange.data, completeLogin])

  if (googleCode && !googleExchange.isError) {
    return (
      <AuthLayout pageTitle="Đăng nhập" brand={{ eyebrow: 'Chào mừng bạn quay lại', lead: 'Đang hoàn tất đăng nhập bằng Google...' }}>
        <div className="flex flex-col items-center gap-4 py-16" role="status">
          <Spin size="large" />
          <p className="text-slate-500 dark:text-slate-400">Đang đăng nhập bằng Google...</p>
        </div>
      </AuthLayout>
    )
  }

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

      {googleTempToken ? (
        <OtpVerificationForm
          destination={maskEmail(googleEmail)}
          hint="Gmail này chưa có tài khoản ToyFlow. Nhập mã vừa gửi tới Gmail để tạo tài khoản."
          resendAfterSeconds={GOOGLE_OTP_RESEND_SECONDS}
          verify={(otpCode) => verifyGoogleOtp({ tempToken: googleTempToken, otpCode })}
          resend={() => resendGoogleOtp(googleTempToken)}
          onVerified={({ tokens }) => completeLogin(tokens, true)}
          submitLabel="Xác minh và tạo tài khoản"
          backLabel="Đăng nhập cách khác"
          onBack={() => setSearchParams(safeRedirect ? { redirect: safeRedirect } : {}, { replace: true })}
        />
      ) : (
        <>
          {registeredIdentifier && (
            <Alert
              type="success"
              showIcon
              title="Đăng ký tài khoản thành công!"
              description="Vui lòng đăng nhập bằng email hoặc số điện thoại và mật khẩu vừa tạo."
              className="auth-form__alert"
            />
          )}

          {googleError && <Alert type="error" showIcon title={googleError} className="auth-form__alert" />}

          {googleExchange.isError && (
            <Alert type="error" showIcon title={getApiErrorMessage(googleExchange.error)} className="auth-form__alert" />
          )}

          <LoginForm defaultIdentifier={registeredIdentifier} onSuccess={({ tokens }, rememberMe) => completeLogin(tokens, rememberMe)} />
        </>
      )}
    </AuthLayout>
  )
}

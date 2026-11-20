import { App, Button, Divider, Steps } from 'antd'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getGoogleAuthUrl, resendRegistrationOtp, verifyRegistrationOtp } from '../features/auth/auth-api'
import { OTP_TTL_SECONDS, type RegisterFormInput } from '../features/auth/auth-schemas'
import { GoogleIcon } from '../features/auth/components/google-icon'
import { OtpVerificationForm } from '../features/auth/components/otp-verification-form'
import { RegisterForm } from '../features/auth/components/register-form'
import { AuthLayout } from '../features/auth/components/auth-layout'
import {
  clearPendingRegistration,
  loadPendingRegistration,
  savePendingRegistration,
  touchPendingRegistration,
  type PendingRegistration,
} from '../features/auth/pending-registration'
import { PATHS } from '../routes/paths'
import { queryClient } from '../services/query-client'
import { saveAuthTokens } from '../services/token-storage'
import { maskEmail } from '../utils/mask-contact'

const STEPS = [{ title: 'Thông tin tài khoản' }, { title: 'Xác minh OTP' }]

export function RegisterPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  // Tải lại trang ở bước nhập mã vẫn ở bước 2 (sessionStorage, không lưu mật khẩu)
  const [pending, setPending] = useState<PendingRegistration | null>(loadPendingRegistration)
  const [draft, setDraft] = useState<RegisterFormInput | undefined>(pending?.draft)
  const challenge = pending?.challenge

  return (
    <AuthLayout
      pageTitle="Tạo tài khoản"
      brand={{
        eyebrow: 'Tham gia cộng đồng ToyFlow',
        lead: 'Tạo tài khoản miễn phí để thuê, mua lại và quyên góp đồ chơi cho bé.',
      }}
    >
      <header className="auth-panel__header">
        <h2 className="auth-panel__title">Tạo tài khoản</h2>
        <p className="auth-panel__subtitle">
          Đã có tài khoản?{' '}
          <Link to={PATHS.login} className="text-link">
            Đăng nhập
          </Link>
        </p>
      </header>

      {!challenge && (
        <>
          <Button block size="large" href={getGoogleAuthUrl()} icon={<GoogleIcon />}>
            Đăng ký bằng Google
          </Button>
          <Divider plain>hoặc đăng ký bằng email</Divider>
        </>
      )}

      <Steps size="small" current={challenge ? 1 : 0} items={STEPS} className="auth-panel__steps" />

      {challenge ? (
        <OtpVerificationForm
          destination={maskEmail(challenge.email)}
          resendAfterSeconds={Math.max(0, challenge.resendAfterSeconds - pending.elapsedSeconds)}
          expiresAfterSeconds={Math.max(0, OTP_TTL_SECONDS - pending.elapsedSeconds)}
          verify={(otp) => verifyRegistrationOtp({ email: challenge.email, otpCode: otp })}
          resend={async () => {
            const next = await resendRegistrationOtp(challenge.email)
            touchPendingRegistration()
            return next
          }}
          onVerified={({ tokens }) => {
            clearPendingRegistration()
            // R03 UC01 bước 5: tài khoản đã tạo và được đăng nhập luôn → mở trang chủ
            saveAuthTokens(tokens, true)
            queryClient.clear()
            message.success('Đăng ký tài khoản thành công!')
            navigate(PATHS.home, { replace: true })
          }}
          submitLabel="Xác minh và tạo tài khoản"
          backLabel="Sửa thông tin đăng ký"
          onBack={() => {
            clearPendingRegistration()
            setPending(null)
          }}
        />
      ) : (
        <RegisterForm
          initialValues={draft}
          onOtpSent={(nextChallenge, values) => {
            savePendingRegistration(nextChallenge, values)
            setDraft(values)
            setPending({ challenge: nextChallenge, draft: values, elapsedSeconds: 0 })
          }}
        />
      )}
    </AuthLayout>
  )
}

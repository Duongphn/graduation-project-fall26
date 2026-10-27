import { Button, Divider, Steps } from 'antd'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getGoogleAuthUrl,
  resendRegistrationOtp,
  verifyRegistrationOtp,
  type OtpChallenge,
} from '../features/auth/auth-api'
import type { RegisterFormInput } from '../features/auth/auth-schemas'
import { GoogleIcon } from '../features/auth/components/google-icon'
import { OtpVerificationForm } from '../features/auth/components/otp-verification-form'
import { RegisterForm } from '../features/auth/components/register-form'
import { AuthLayout } from '../features/auth/components/auth-layout'
import { PATHS } from '../routes/paths'
import { maskEmail } from '../utils/mask-contact'
import type { LoginPageState } from './login-page'

const STEPS = [{ title: 'Thông tin tài khoản' }, { title: 'Xác minh OTP' }]

export function RegisterPage() {
  const navigate = useNavigate()
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null)
  const [draft, setDraft] = useState<RegisterFormInput>()

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
          resendAfterSeconds={challenge.resendAfterSeconds}
          verify={(otp) => verifyRegistrationOtp({ email: challenge.email, otpCode: otp })}
          resend={() => resendRegistrationOtp(challenge.email)}
          onVerified={() => {
            // Không tự đăng nhập: đưa người dùng về trang đăng nhập kèm thông báo thành công
            const state: LoginPageState = { registeredIdentifier: challenge.email }
            navigate(PATHS.login, { replace: true, state })
          }}
          submitLabel="Xác minh và tạo tài khoản"
          backLabel="Sửa thông tin đăng ký"
          onBack={() => setChallenge(null)}
        />
      ) : (
        <RegisterForm
          initialValues={draft}
          onOtpSent={(nextChallenge, values) => {
            setDraft(values)
            setChallenge(nextChallenge)
          }}
        />
      )}
    </AuthLayout>
  )
}

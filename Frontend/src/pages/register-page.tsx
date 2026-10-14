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
import { saveSession } from '../services/token-storage'
import { maskPhone } from '../utils/mask-contact'

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
          <Divider plain>hoặc đăng ký bằng số điện thoại</Divider>
        </>
      )}

      <Steps size="small" current={challenge ? 1 : 0} items={STEPS} className="auth-panel__steps" />

      {challenge ? (
        <OtpVerificationForm
          destination={maskPhone(challenge.phone)}
          resendAfterSeconds={challenge.resendAfterSeconds}
          verify={(otp) => verifyRegistrationOtp({ phone: challenge.phone, otp })}
          resend={() => resendRegistrationOtp(challenge.phone)}
          onVerified={(session) => {
            saveSession(session, true)
            navigate(PATHS.home, { replace: true })
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

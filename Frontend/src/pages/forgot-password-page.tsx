import { Button, Result, Steps } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset, verifyPasswordResetCode, type ResetCodeChallenge } from '../features/auth/auth-api'
import { ForgotPasswordEmailForm } from '../features/auth/components/forgot-password-email-form'
import { OtpVerificationForm } from '../features/auth/components/otp-verification-form'
import { ResetPasswordForm } from '../features/auth/components/reset-password-form'
import { AuthLayout } from '../layouts/auth/auth-layout'
import { PATHS } from '../routes/paths'
import { maskEmail } from '../utils/mask-contact'

const STEPS = [{ title: 'Email' }, { title: 'Nhập mã' }, { title: 'Mật khẩu mới' }]

type RecoveryState =
  | { step: 'email'; email?: string }
  | { step: 'code'; challenge: ResetCodeChallenge }
  | { step: 'new-password'; resetToken: string }
  | { step: 'done' }

const STEP_INDEX = { email: 0, code: 1, 'new-password': 2, done: 2 } as const

export function ForgotPasswordPage() {
  const [state, setState] = useState<RecoveryState>({ step: 'email' })

  return (
    <AuthLayout
      pageTitle="Quên mật khẩu"
      brand={{
        eyebrow: 'Khôi phục tài khoản',
        lead: 'Nhận mã xác minh qua email và đặt lại mật khẩu chỉ trong vài bước.',
      }}
    >
      {state.step === 'done' ? (
        <Result
          status="success"
          title="Đổi mật khẩu thành công"
          subTitle="Mật khẩu của bạn đã được cập nhật. Hãy đăng nhập lại bằng mật khẩu mới để tiếp tục sử dụng ToyFlow."
          extra={
            <Link to={PATHS.login} replace>
              <Button type="primary" size="large" block>
                Đăng nhập ngay
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <header className="auth-panel__header">
            <h2 className="auth-panel__title">Quên mật khẩu</h2>
            <p className="auth-panel__subtitle">
              Nhớ ra mật khẩu rồi?{' '}
              <Link to={PATHS.login} className="text-link">
                Đăng nhập
              </Link>
            </p>
          </header>

          <Steps size="small" current={STEP_INDEX[state.step]} items={STEPS} className="auth-panel__steps" />

          {state.step === 'email' && (
            <ForgotPasswordEmailForm
              initialEmail={state.email}
              onCodeSent={(challenge) => setState({ step: 'code', challenge })}
            />
          )}

          {state.step === 'code' && (
            <OtpVerificationForm
              destination={maskEmail(state.challenge.email)}
              // Không khẳng định email tồn tại, để không lộ danh sách tài khoản đã đăng ký
              hint="Nếu email này đã đăng ký tài khoản, mã sẽ đến trong vài phút. Không thấy email? Hãy kiểm tra thư mục Spam."
              resendAfterSeconds={state.challenge.resendAfterSeconds}
              verify={(code) => verifyPasswordResetCode({ email: state.challenge.email, code })}
              resend={() => requestPasswordReset(state.challenge.email)}
              onVerified={(resetToken) => setState({ step: 'new-password', resetToken })}
              submitLabel="Xác minh mã"
              backLabel="Dùng email khác"
              onBack={() => setState({ step: 'email', email: state.challenge.email })}
            />
          )}

          {state.step === 'new-password' && (
            <ResetPasswordForm resetToken={state.resetToken} onPasswordReset={() => setState({ step: 'done' })} />
          )}
        </>
      )}
    </AuthLayout>
  )
}

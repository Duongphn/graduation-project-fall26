import { ArrowLeftOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Typography } from 'antd'
import { useForm } from 'react-hook-form'
import { FormItem } from '../../../components/ui/form-item'
import { useCountdown } from '../../../hooks/use-countdown'
import { getApiErrorMessage } from '../../../services/http-client'
import { OTP_LENGTH, otpSchema, type OtpFormValues } from '../auth-schemas'

interface OtpVerificationFormProps<TResult> {
  /** Nơi nhận mã đã được che bớt, vd: "0901 *** 567" hoặc "ng***@gmail.com" */
  destination: string
  hint?: string
  /** Mã điền sẵn, vd: khi mở từ link trong email */
  initialOtp?: string
  resendAfterSeconds: number
  verify: (otp: string) => Promise<TResult>
  resend: () => Promise<{ resendAfterSeconds: number }>
  onVerified: (result: TResult) => void
  submitLabel: string
  backLabel: string
  onBack: () => void
}

export function OtpVerificationForm<TResult>({
  destination,
  hint,
  initialOtp = '',
  resendAfterSeconds,
  verify,
  resend,
  onVerified,
  submitLabel,
  backLabel,
  onBack,
}: OtpVerificationFormProps<TResult>) {
  const [secondsLeft, restartCountdown] = useCountdown(resendAfterSeconds)

  const { control, handleSubmit } = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: initialOtp },
  })

  const verifyMutation = useMutation({
    mutationFn: ({ otp }: OtpFormValues) => verify(otp),
    onSuccess: onVerified,
  })

  const resendMutation = useMutation({
    mutationFn: resend,
    onSuccess: (next) => restartCountdown(next.resendAfterSeconds),
  })

  const isVerifying = verifyMutation.isPending
  const serverError = verifyMutation.error ?? resendMutation.error

  return (
    <Form
      layout="vertical"
      size="large"
      requiredMark={false}
      noValidate
      disabled={isVerifying}
      onFinish={() => handleSubmit((values) => verifyMutation.mutate(values))()}
    >
      <Alert
        type="info"
        showIcon
        className="auth-form__alert"
        title={
          <>
            Mã xác minh gồm {OTP_LENGTH} chữ số đã được gửi tới <strong>{destination}</strong>
          </>
        }
        description={hint}
      />

      <FormItem control={control} name="otp" label="Mã xác minh">
        {(field, controlProps) => (
          <Input.OTP
            {...controlProps}
            value={field.value}
            onChange={field.onChange}
            length={OTP_LENGTH}
            formatter={(value) => value.replace(/\D/g, '')}
            autoFocus
            className="otp-input"
          />
        )}
      </FormItem>

      <div className="otp-resend">
        {secondsLeft > 0 ? (
          <Typography.Text type="secondary">Gửi lại mã sau {secondsLeft}s</Typography.Text>
        ) : (
          <Button
            type="link"
            size="small"
            onClick={() => resendMutation.mutate()}
            loading={resendMutation.isPending}
            className="otp-resend__button"
          >
            Gửi lại mã
          </Button>
        )}
        {resendMutation.isSuccess && secondsLeft > 0 && (
          <Typography.Text type="success" role="status">
            <CheckCircleOutlined /> Đã gửi mã mới
          </Typography.Text>
        )}
      </div>

      {serverError && <Alert type="error" showIcon title={getApiErrorMessage(serverError)} className="auth-form__alert" />}

      <div className="auth-form__actions">
        <Button type="primary" htmlType="submit" block loading={isVerifying}>
          {isVerifying ? 'Đang xác minh...' : submitLabel}
        </Button>
        <Button type="text" block icon={<ArrowLeftOutlined />} onClick={onBack}>
          {backLabel}
        </Button>
      </div>
    </Form>
  )
}

import { ArrowLeftOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, Input, Typography, type GetRef } from 'antd'
import { useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { FormItem } from '../../../components/ui/form-item'
import { useCountdown } from '../../../hooks/use-countdown'
import { getApiErrorMessage } from '../../../services/http-client'
import { OTP_LENGTH, OTP_TTL_SECONDS, otpSchema, type OtpFormValues } from '../auth-schemas'

/** 300 → "5:00" */
const formatMinutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

interface OtpVerificationFormProps<TResult> {
  /** Nơi nhận mã đã được che bớt, vd: "0901 *** 567" hoặc "ng***@gmail.com" */
  destination: string
  hint?: string
  /** Mã điền sẵn, vd: khi mở từ link trong email */
  initialOtp?: string
  resendAfterSeconds: number
  /** Số giây còn lại trước khi mã hết hạn (mặc định 5 phút — GB-02); tải lại trang thì truyền phần còn lại */
  expiresAfterSeconds?: number
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
  expiresAfterSeconds = OTP_TTL_SECONDS,
  verify,
  resend,
  onVerified,
  submitLabel,
  backLabel,
  onBack,
}: OtpVerificationFormProps<TResult>) {
  const [secondsLeft, restartCountdown] = useCountdown(resendAfterSeconds)
  const [expiresLeft, restartExpiry] = useCountdown(expiresAfterSeconds)
  const otpRef = useRef<GetRef<typeof Input.OTP>>(null)

  const { control, handleSubmit, setValue } = useForm<OtpFormValues>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: initialOtp },
  })
  const otp = useWatch({ control, name: 'otp' })

  /** R03 III.1.1.1 (12): mã sai → báo lỗi và xoá các ô để nhập lại */
  const clearOtp = () => {
    setValue('otp', '')
    otpRef.current?.focus()
  }

  const verifyMutation = useMutation({
    mutationFn: ({ otp }: OtpFormValues) => verify(otp),
    onSuccess: onVerified,
    onError: clearOtp,
  })

  const resendMutation = useMutation({
    mutationFn: resend,
    onSuccess: (next) => {
      restartCountdown(next.resendAfterSeconds)
      restartExpiry(OTP_TTL_SECONDS)
      // Mã cũ hết dùng: bỏ lỗi của mã cũ và các ô đã nhập
      verifyMutation.reset()
      clearOtp()
    },
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
            ref={otpRef}
            value={field.value}
            // onInput: mỗi lần gõ/xoá một ô; onChange: chỉ khi đủ 6 số → tự gửi mã (R03 III.1.1.1 (12))
            onInput={(cells) => field.onChange(cells.join(''))}
            onChange={(code) => {
              field.onChange(code)
              if (!verifyMutation.isPending) verifyMutation.mutate({ otp: code })
            }}
            length={OTP_LENGTH}
            formatter={(value) => value.replace(/\D/g, '')}
            autoFocus
            className="otp-input"
          />
        )}
      </FormItem>

      <div className="otp-resend">
        {/* R03 III.1.1.1 (13): mã có hiệu lực 5 phút */}
        {expiresLeft > 0 ? (
          <Typography.Text type="secondary" role="timer">
            Mã hết hạn sau {formatMinutes(expiresLeft)}
          </Typography.Text>
        ) : (
          <Typography.Text type="danger" role="status">
            Mã đã hết hạn, hãy gửi lại mã.
          </Typography.Text>
        )}
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
        {/* Chỉ bật khi đã nhập đủ 6 số (R03 III.1.1.1 (14)) */}
        <Button type="primary" htmlType="submit" block loading={isVerifying} disabled={otp.length !== OTP_LENGTH}>
          {isVerifying ? 'Đang xác minh...' : submitLabel}
        </Button>
        <Button type="text" block icon={<ArrowLeftOutlined />} onClick={onBack}>
          {backLabel}
        </Button>
      </div>
    </Form>
  )
}

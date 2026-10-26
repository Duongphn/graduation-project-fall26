import { ArrowRightOutlined } from '@ant-design/icons'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Col, Form, Input, Row } from 'antd'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { PasswordStrengthMeter } from './password-strength-meter'
import { register as registerAccount, type OtpChallenge } from '../auth-api'
import { registerSchema, type RegisterFormInput, type RegisterFormValues } from '../auth-schemas'
import { FormItem } from '../../../components/ui/form-item'
import { PATHS } from '../../../routes/paths'
import { getApiErrorMessage } from '../../../services/http-client'

const EMPTY_VALUES: RegisterFormInput = {
  fullName: '',
  phone: '',
  email: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false,
}

const HALF_COLUMN = { xs: 24, sm: 12 } as const

interface RegisterFormProps {
  initialValues?: RegisterFormInput
  onOtpSent: (challenge: OtpChallenge, values: RegisterFormInput) => void
}

export function RegisterForm({ initialValues = EMPTY_VALUES, onOtpSent }: RegisterFormProps) {
  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<RegisterFormInput, unknown, RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: initialValues,
    mode: 'onTouched',
  })

  const password = useWatch({ control, name: 'password' })

  const registerMutation = useMutation({
    mutationFn: registerAccount,
    onSuccess: (challenge) => onOtpSent(challenge, getValues()),
  })

  const isSubmitting = registerMutation.isPending

  return (
    <Form
      layout="vertical"
      size="large"
      requiredMark={false}
      noValidate
      disabled={isSubmitting}
      onFinish={() => handleSubmit((values) => registerMutation.mutate(values))()}
    >
      <FormItem control={control} name="fullName" label="Họ và tên">
        {(field, controlProps) => (
          <Input {...field} {...controlProps} autoComplete="name" autoFocus placeholder="Nguyễn Văn A" />
        )}
      </FormItem>

      <Row gutter={16}>
        <Col {...HALF_COLUMN}>
          <FormItem control={control} name="phone" label="Số điện thoại">
            {(field, controlProps) => (
              <Input {...field} {...controlProps} type="tel" autoComplete="tel" placeholder="0901234567" />
            )}
          </FormItem>
        </Col>
        <Col {...HALF_COLUMN}>
          <FormItem control={control} name="email" label="Email">
            {(field, controlProps) => (
              <Input {...field} {...controlProps} type="email" autoComplete="email" placeholder="ban@email.com" />
            )}
          </FormItem>
        </Col>
        <Col {...HALF_COLUMN}>
          <FormItem
            control={control}
            name="password"
            label="Mật khẩu"
            extra={!errors.password && <PasswordStrengthMeter password={password} />}
          >
            {(field, controlProps) => (
              <Input.Password {...field} {...controlProps} autoComplete="new-password" placeholder="Chữ và số" />
            )}
          </FormItem>
        </Col>
        <Col {...HALF_COLUMN}>
          <FormItem control={control} name="confirmPassword" label="Nhập lại mật khẩu">
            {(field, controlProps) => <Input.Password {...field} {...controlProps} autoComplete="new-password" />}
          </FormItem>
        </Col>
      </Row>

      <Controller
        control={control}
        name="acceptTerms"
        render={({ field, fieldState }) => (
          <Form.Item
            validateStatus={fieldState.error ? 'error' : undefined}
            help={fieldState.error && <span id="acceptTerms-error">{fieldState.error.message}</span>}
          >
            <Checkbox
              checked={field.value}
              onChange={(event) => field.onChange(event.target.checked)}
              aria-invalid={!!fieldState.error}
              aria-describedby={fieldState.error ? 'acceptTerms-error' : undefined}
            >
              Tôi đồng ý với{' '}
              <Link to={PATHS.terms} className="text-link text-link--inline">
                Điều khoản dịch vụ
              </Link>{' '}
              và{' '}
              <Link to={PATHS.privacy} className="text-link text-link--inline">
                Chính sách bảo mật
              </Link>
            </Checkbox>
          </Form.Item>
        )}
      />

      {registerMutation.isError && (
        <Alert type="error" showIcon title={getApiErrorMessage(registerMutation.error)} className="auth-form__alert" />
      )}

      <Button
        type="primary"
        htmlType="submit"
        block
        loading={isSubmitting}
        icon={<ArrowRightOutlined />}
        iconPlacement="end"
      >
        {isSubmitting ? 'Đang gửi mã OTP...' : 'Tiếp tục'}
      </Button>
    </Form>
  )
}

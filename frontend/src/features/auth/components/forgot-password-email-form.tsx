import { ArrowRightOutlined, MailOutlined } from '@ant-design/icons'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, Input } from 'antd'
import { useForm } from 'react-hook-form'
import { FormItem } from '../../../components/ui/form-item'
import { getApiErrorMessage } from '../../../services/http-client'
import { requestPasswordReset, type ResetCodeChallenge } from '../auth-api'
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '../auth-schemas'

interface ForgotPasswordEmailFormProps {
  initialEmail?: string
  onCodeSent: (challenge: ResetCodeChallenge) => void
}

export function ForgotPasswordEmailForm({ initialEmail = '', onCodeSent }: ForgotPasswordEmailFormProps) {
  const { control, handleSubmit } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: initialEmail },
    mode: 'onTouched',
  })

  const requestMutation = useMutation({
    mutationFn: ({ email }: ForgotPasswordFormValues) => requestPasswordReset(email),
    onSuccess: onCodeSent,
  })

  const isSubmitting = requestMutation.isPending

  return (
    <Form
      layout="vertical"
      size="large"
      requiredMark={false}
      noValidate
      disabled={isSubmitting}
      onFinish={() => handleSubmit((values) => requestMutation.mutate(values))()}
    >
      <FormItem control={control} name="email" label="Email đã đăng ký">
        {(field, controlProps) => (
          <Input
            {...field}
            {...controlProps}
            type="email"
            prefix={<MailOutlined className="form-control__icon" />}
            autoComplete="email"
            autoFocus
            placeholder="ban@email.com"
          />
        )}
      </FormItem>

      {requestMutation.isError && (
        <Alert type="error" showIcon title={getApiErrorMessage(requestMutation.error)} className="auth-form__alert" />
      )}

      <Button
        type="primary"
        htmlType="submit"
        block
        loading={isSubmitting}
        icon={<ArrowRightOutlined />}
        iconPlacement="end"
      >
        {isSubmitting ? 'Đang gửi mã...' : 'Gửi mã xác minh'}
      </Button>
    </Form>
  )
}

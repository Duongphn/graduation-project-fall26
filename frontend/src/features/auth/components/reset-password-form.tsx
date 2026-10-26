import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Form, Input } from 'antd'
import { useForm, useWatch } from 'react-hook-form'
import { FormItem } from '../../../components/ui/form-item'
import { getApiErrorMessage } from '../../../services/http-client'
import { resetPassword } from '../auth-api'
import { resetPasswordSchema, type ResetPasswordFormValues } from '../auth-schemas'
import { PasswordStrengthMeter } from './password-strength-meter'

interface ResetPasswordFormProps {
  resetToken: string
  onPasswordReset: () => void
}

export function ResetPasswordForm({ resetToken, onPasswordReset }: ResetPasswordFormProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
    mode: 'onTouched',
  })

  const password = useWatch({ control, name: 'password' })

  const resetMutation = useMutation({
    mutationFn: ({ password: newPassword }: ResetPasswordFormValues) => resetPassword({ resetToken, newPassword }),
    onSuccess: onPasswordReset,
  })

  const isSubmitting = resetMutation.isPending

  return (
    <Form
      layout="vertical"
      size="large"
      requiredMark={false}
      noValidate
      disabled={isSubmitting}
      onFinish={() => handleSubmit((values) => resetMutation.mutate(values))()}
    >
      <FormItem
        control={control}
        name="password"
        label="Mật khẩu mới"
        extra={!errors.password && <PasswordStrengthMeter password={password} />}
      >
        {(field, controlProps) => (
          <Input.Password
            {...field}
            {...controlProps}
            autoComplete="new-password"
            autoFocus
            placeholder="Chữ và số, tối thiểu 8 ký tự"
          />
        )}
      </FormItem>

      <FormItem control={control} name="confirmPassword" label="Nhập lại mật khẩu mới">
        {(field, controlProps) => <Input.Password {...field} {...controlProps} autoComplete="new-password" />}
      </FormItem>

      {resetMutation.isError && (
        <Alert type="error" showIcon title={getApiErrorMessage(resetMutation.error)} className="auth-form__alert" />
      )}

      <Button type="primary" htmlType="submit" block loading={isSubmitting}>
        {isSubmitting ? 'Đang đổi mật khẩu...' : 'Đổi mật khẩu'}
      </Button>
    </Form>
  )
}

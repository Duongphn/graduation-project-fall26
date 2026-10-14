import { ArrowRightOutlined, UserOutlined } from '@ant-design/icons'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Divider, Form, Input } from 'antd'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { GoogleIcon } from './google-icon'
import { getGoogleAuthUrl, login, type AuthSession } from '../auth-api'
import { loginSchema, type LoginFormValues } from '../auth-schemas'
import { FormItem } from '../../../components/ui/form-item'
import { PATHS } from '../../../routes/paths'
import { getApiErrorMessage } from '../../../services/http-client'

interface LoginFormProps {
  onSuccess: (session: AuthSession, rememberMe: boolean) => void
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { control, handleSubmit } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '', rememberMe: true },
    mode: 'onTouched',
  })

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (session, values) => onSuccess(session, values.rememberMe),
  })

  const isSubmitting = loginMutation.isPending

  return (
    <Form
      layout="vertical"
      size="large"
      requiredMark={false}
      noValidate
      disabled={isSubmitting}
      // antd chỉ lo hiển thị; validate + submit do react-hook-form xử lý
      onFinish={() => handleSubmit((values) => loginMutation.mutate(values))()}
    >
      <FormItem control={control} name="identifier" label="Số điện thoại hoặc email">
        {(field, controlProps) => (
          <Input
            {...field}
            {...controlProps}
            prefix={<UserOutlined className="form-control__icon" />}
            autoComplete="username"
            autoFocus
            placeholder="0901234567 hoặc ban@email.com"
          />
        )}
      </FormItem>

      <FormItem control={control} name="password" label="Mật khẩu">
        {(field, controlProps) => (
          <Input.Password
            {...field}
            {...controlProps}
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
          />
        )}
      </FormItem>

      <div className="auth-form__options">
        <Controller
          control={control}
          name="rememberMe"
          render={({ field }) => (
            <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
              Ghi nhớ đăng nhập
            </Checkbox>
          )}
        />
        <Link to={PATHS.forgotPassword} className="text-link text-link--small">
          Quên mật khẩu?
        </Link>
      </div>

      {loginMutation.isError && (
        <Alert type="error" showIcon title={getApiErrorMessage(loginMutation.error)} className="auth-form__alert" />
      )}

      <Button type="primary" htmlType="submit" block loading={isSubmitting} icon={<ArrowRightOutlined />} iconPlacement="end">
        {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
      </Button>

      <Divider plain>hoặc</Divider>

      <Button block href={getGoogleAuthUrl()} icon={<GoogleIcon />}>
        Tiếp tục với Google
      </Button>
    </Form>
  )
}

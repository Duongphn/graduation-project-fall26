import { Navigate, Route, Routes } from 'react-router-dom'
import { ForgotPasswordPage } from '../pages/forgot-password-page'
import { LoginPage } from '../pages/login-page'
import { RegisterPage } from '../pages/register-page'
import { PATHS } from './paths'

export function AppRoutes() {
  return (
    <Routes>
      <Route path={PATHS.login} element={<LoginPage />} />
      <Route path={PATHS.register} element={<RegisterPage />} />
      <Route path={PATHS.forgotPassword} element={<ForgotPasswordPage />} />
      {/* Chưa có trang chủ: tạm đưa mọi đường dẫn về trang đăng nhập */}
      <Route path="*" element={<Navigate to={PATHS.login} replace />} />
    </Routes>
  )
}

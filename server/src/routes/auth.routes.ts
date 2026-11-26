import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { env } from '../config/env.js';
import { createRateLimiter } from '../middlewares/rate-limit.js';
import type { AuthService } from '../services/auth.service.js';

export function createAuthRouter(
  service: AuthService,
  controller: AuthController = new AuthController(service),
): Router {
  const authRouter = Router();

  // Bursts of sign-in, code and reset requests from one client are slowed down (TC-SEC-032).
  const limitPerMinute = env.authRateLimitPerMinute;
  authRouter.post(
    '/auth/*path',
    createRateLimiter({ windowMs: 60_000, max: limitPerMinute, enabled: limitPerMinute > 0 }),
  );

  // 1. Đăng ký tài khoản (Email, Password, FullName, Phone)
  authRouter.post('/auth/register', controller.register);
  authRouter.post('/auth/register/verify-otp', controller.verifyRegistrationOtp);
  authRouter.post('/auth/register/resend-otp', controller.resendRegistrationOtp);

  // Đăng nhập bằng Email hoặc Số điện thoại + Mật khẩu
  authRouter.post('/auth/login', controller.login);

  // 2. Đăng nhập Google qua Web Redirect (khi click nút "Tiếp tục với Google" trên Frontend)
  authRouter.get('/auth/google', controller.redirectToGoogle);
  authRouter.get('/auth/google/callback', controller.handleGoogleCallback);
  authRouter.post('/auth/google/exchange', controller.exchangeGoogleLoginCode);

  // Đăng nhập Google qua Direct API (POST ID Token) & Xác thực OTP 2FA qua Gmail
  authRouter.post('/auth/google', controller.loginWithGoogle);
  authRouter.post('/auth/google/verify-otp', controller.verifyGoogleOtp);
  authRouter.post('/auth/google/resend-otp', controller.resendGoogleOtp);

  // 3. Quên mật khẩu: gửi mã qua Email → xác minh mã lấy resetToken → đặt mật khẩu mới
  authRouter.post('/auth/forgot-password', controller.forgotPassword);
  authRouter.post('/auth/verify-reset-code', controller.verifyResetCode);
  authRouter.post('/auth/reset-password', controller.resetPassword);

  // 4. Token Refresh & Logout
  authRouter.post('/auth/refresh-token', controller.refreshToken);
  authRouter.post('/auth/logout', controller.logout);

  // Endpoint test nhanh tiện lợi cho Thunder Client / Postman (chỉ chạy ở dev)
  authRouter.post('/auth/dev-test-otp', controller.devTestOtp);

  return authRouter;
}

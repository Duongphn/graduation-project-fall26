import { Router } from 'express';
import { AuthController } from './auth.controller.js';

export const authRouter = Router();
const controller = new AuthController();

// 1. Đăng ký tài khoản (Email, Password, FullName, Phone)
authRouter.post('/auth/register', controller.register);

// 2. Đăng nhập Google & Xác thực OTP 2FA qua Gmail
authRouter.post('/auth/google', controller.loginWithGoogle);
authRouter.post('/auth/google/verify-otp', controller.verifyGoogleOtp);
authRouter.post('/auth/google/resend-otp', controller.resendGoogleOtp);

// 3. Quên mật khẩu & Đặt lại mật khẩu (OTP / Link qua Email)
authRouter.post('/auth/forgot-password', controller.forgotPassword);
authRouter.post('/auth/reset-password', controller.resetPassword);

// 4. Token Refresh & Logout
authRouter.post('/auth/refresh-token', controller.refreshToken);
authRouter.post('/auth/logout', controller.logout);

// Endpoint test nhanh tiện lợi cho Thunder Client / Postman (chỉ chạy ở dev)
authRouter.post('/auth/dev-test-otp', controller.devTestOtp);

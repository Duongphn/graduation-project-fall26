import { Router } from 'express';
import { AuthController } from './auth.controller.js';

export const authRouter = Router();
const controller = new AuthController();

// Đăng ký tài khoản (Email, Password, FullName, Phone)
authRouter.post('/auth/register', controller.register);

// Đăng nhập Google & Xác thực OTP 2FA qua Gmail
authRouter.post('/auth/google', controller.loginWithGoogle);
authRouter.post('/auth/google/verify-otp', controller.verifyGoogleOtp);
authRouter.post('/auth/google/resend-otp', controller.resendGoogleOtp);

// Endpoint test nhanh tiện lợi cho Thunder Client / Postman (chỉ chạy ở dev)
authRouter.post('/auth/dev-test-otp', controller.devTestOtp);

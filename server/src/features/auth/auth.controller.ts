import type { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import { AuthService } from './auth.service.js';
import {
  googleLoginSchema,
  verifyGoogleOtpSchema,
  resendGoogleOtpSchema,
  devTestLoginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
  logoutSchema,
} from './auth.validation.js';

export class AuthController {
  private readonly authService: AuthService;

  public constructor(authService = new AuthService()) {
    this.authService = authService;
  }

  /**
   * GET /api/v1/auth/google
   * Chuyển hướng người dùng sang trang đăng nhập tài khoản của Google
   */
  public redirectToGoogle = (req: Request, res: Response): void => {
    const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/auth/google/callback`;
    const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleUrl.searchParams.set('client_id', env.googleClientId);
    googleUrl.searchParams.set('redirect_uri', redirectUri);
    googleUrl.searchParams.set('response_type', 'code');
    googleUrl.searchParams.set('scope', 'openid email profile');
    googleUrl.searchParams.set('access_type', 'offline');
    googleUrl.searchParams.set('prompt', 'consent');

    res.redirect(googleUrl.toString());
  };

  /**
   * GET /api/v1/auth/google/callback
   * Nhận callback từ Google, đổi code lấy tokens, gửi OTP về Gmail và chuyển về Frontend
   */
  public handleGoogleCallback = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const code = req.query.code as string;
      if (!code) {
        res.redirect(`${env.corsOrigin}/login?error=no_code`);
        return;
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/auth/google/callback`;
      const oauthClient = new OAuth2Client(
        env.googleClientId,
        env.googleClientSecret,
        redirectUri
      );

      const { tokens } = await oauthClient.getToken(code);
      if (!tokens.id_token) {
        res.redirect(`${env.corsOrigin}/login?error=no_id_token`);
        return;
      }

      const result = await this.authService.loginWithGoogle(tokens.id_token);

      // Chuyển hướng về Frontend kèm tempToken để người dùng nhập OTP
      res.redirect(
        `${env.corsOrigin}/login?tempToken=${encodeURIComponent(result.tempToken)}&email=${encodeURIComponent(result.email)}&step=otp`
      );
    } catch (error) {
      console.error('Lỗi Google Callback:', error);
      res.redirect(`${env.corsOrigin}/login?error=google_auth_failed`);
    }
  };

  /**
   * POST /api/v1/auth/google
   * Xác thực tài khoản Google và gửi mã OTP qua Gmail (khi frontend gửi ID Token trực tiếp)
   */
  public loginWithGoogle = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = googleLoginSchema.parse(req.body);
      const result = await this.authService.loginWithGoogle(validated.idToken);

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/google/verify-otp
   * Xác minh mã OTP gửi về Gmail và hoàn tất đăng nhập
   */
  public verifyGoogleOtp = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = verifyGoogleOtpSchema.parse(req.body);
      const result = await this.authService.verifyGoogleOtp(
        validated.tempToken,
        validated.otpCode
      );

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: 'Xác thực thành công. Đăng nhập hoàn tất!',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/google/resend-otp
   * Gửi lại mã OTP
   */
  public resendGoogleOtp = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = resendGoogleOtpSchema.parse(req.body);
      const result = await this.authService.resendGoogleOtp(validated.tempToken);

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/dev-test-otp
   * Hỗ trợ test gửi OTP qua Gmail trên Thunder Client/Postman mà không cần token Google
   */
  public devTestOtp = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = devTestLoginSchema.parse(req.body);
      const result = await this.authService.devLoginWithEmail(validated.email);

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/register
   * Đăng ký tài khoản người dùng bằng Email, Mật khẩu, Họ tên và Số điện thoại
   */
  public register = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = registerSchema.parse(req.body);
      const result = await this.authService.register(validated);

      res.status(201).json({
        success: true,
        statusCode: 201,
        message: 'Đăng ký tài khoản thành công!',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/forgot-password
   * Yêu cầu đặt lại mật khẩu qua Email (nhận mã OTP và Link)
   */
  public forgotPassword = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = forgotPasswordSchema.parse(req.body);
      const result = await this.authService.forgotPassword(validated.email);

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/reset-password
   * Xác thực mã OTP và đặt mật khẩu mới
   */
  public resetPassword = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = resetPasswordSchema.parse(req.body);
      const result = await this.authService.resetPassword(validated);

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/refresh-token
   * Cấp lại Access Token mới bằng Refresh Token (Token Rotation)
   */
  public refreshToken = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = refreshTokenSchema.parse(req.body);
      const result = await this.authService.refreshToken(validated.refreshToken);

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: 'Làm mới token thành công!',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/logout
   * Đăng xuất tài khoản (thu hồi refresh token)
   */
  public logout = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = logoutSchema.parse(req.body);
      const result = await this.authService.logout(
        validated.refreshToken,
        validated.allDevices
      );

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  };
}

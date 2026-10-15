import type { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/app-error.js';
import { AuthService } from './auth.service.js';
import {
  googleLoginSchema,
  googleExchangeSchema,
  verifyGoogleOtpSchema,
  resendGoogleOtpSchema,
  devTestLoginSchema,
  registerSchema,
  verifyRegistrationOtpSchema,
  resendRegistrationOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyResetCodeSchema,
  resetPasswordSchema,
  refreshTokenSchema,
  logoutSchema,
  sendPhoneOtpSchema,
  verifyPhoneOtpSchema,
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
   * Nhận callback từ Google, đổi code lấy tokens rồi chuyển về Frontend:
   * - Gmail đã đăng ký → kèm googleCode để Frontend đổi lấy phiên đăng nhập
   * - Gmail chưa đăng ký → kèm tempToken để Frontend hiện bước nhập OTP
   */
  public handleGoogleCallback = async (req: Request, res: Response): Promise<void> => {
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

      const result = await this.authService.handleGoogleRedirectLogin(tokens.id_token);

      if (result.step === 'AUTHENTICATED') {
        res.redirect(`${env.corsOrigin}/login?googleCode=${encodeURIComponent(result.loginCode)}`);
        return;
      }

      // Gmail chưa đăng ký: chuyển về Frontend kèm tempToken để người dùng nhập OTP
      res.redirect(
        `${env.corsOrigin}/login?tempToken=${encodeURIComponent(result.tempToken)}&email=${encodeURIComponent(result.email)}&step=otp`
      );
    } catch (error) {
      console.error('Lỗi Google Callback:', error);
      // Lỗi nghiệp vụ (tài khoản bị khóa, email chưa xác minh...) trả đúng mã để Frontend hiện thông báo phù hợp
      const errorCode = error instanceof AppError ? error.code : 'google_auth_failed';
      res.redirect(`${env.corsOrigin}/login?error=${encodeURIComponent(errorCode)}`);
    }
  };

  /**
   * POST /api/v1/auth/google/exchange
   * Đổi mã googleCode (nhận được sau khi đăng nhập Google qua Web Redirect) lấy phiên đăng nhập
   */
  public exchangeGoogleLoginCode = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = googleExchangeSchema.parse(req.body);
      const result = await this.authService.exchangeGoogleLoginCode(validated.code);

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: 'Đăng nhập Google thành công!',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/google
   * Xác thực tài khoản Google khi frontend gửi ID Token trực tiếp:
   * Gmail đã đăng ký → trả phiên đăng nhập; chưa đăng ký → gửi mã OTP qua Gmail
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
        message: result.step === 'AUTHENTICATED' ? 'Đăng nhập Google thành công!' : result.message,
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
   * Bước 1 đăng ký: nhận Email, Mật khẩu, Họ tên, Số điện thoại và gửi mã OTP về Email
   */
  public register = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = registerSchema.parse(req.body);
      const result = await this.authService.register(validated);

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
   * POST /api/v1/auth/register/verify-otp
   * Bước 2 đăng ký: xác minh mã OTP và tạo tài khoản
   */
  public verifyRegistrationOtp = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = verifyRegistrationOtpSchema.parse(req.body);
      const result = await this.authService.verifyRegistrationOtp(validated);

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
   * POST /api/v1/auth/register/resend-otp
   * Gửi lại mã OTP đăng ký
   */
  public resendRegistrationOtp = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = resendRegistrationOtpSchema.parse(req.body);
      const result = await this.authService.resendRegistrationOtp(validated.email);

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
   * POST /api/v1/auth/login
   * Đăng nhập bằng Email hoặc Số điện thoại + Mật khẩu
   */
  public login = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = loginSchema.parse(req.body);
      const result = await this.authService.login(validated);

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: 'Đăng nhập thành công!',
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
   * POST /api/v1/auth/verify-reset-code
   * Xác minh mã OTP quên mật khẩu, trả về resetToken dùng cho bước đặt mật khẩu mới
   */
  public verifyResetCode = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = verifyResetCodeSchema.parse(req.body);
      const result = await this.authService.verifyResetCode(validated);

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: 'Xác minh mã thành công. Vui lòng đặt mật khẩu mới.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/reset-password
   * Đặt mật khẩu mới bằng resetToken nhận được sau khi xác minh mã
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

  /**
   * POST /api/v1/auth/phone/send-otp
   * Gửi mã OTP xác minh số điện thoại qua SMS (Twilio)
   */
  public sendPhoneOtp = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = sendPhoneOtpSchema.parse(req.body);
      const result = await this.authService.sendPhoneOtp(validated.phone);

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
   * POST /api/v1/auth/phone/verify-otp
   * Xác thực mã OTP gửi về số điện thoại
   */
  public verifyPhoneOtp = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const validated = verifyPhoneOtpSchema.parse(req.body);
      const result = await this.authService.verifyPhoneOtp(
        validated.phone,
        validated.otpCode
      );

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
}

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import { sendOtpEmail, sendResetPasswordEmail } from '../../infrastructure/email/mailer.js';
import { sendPhoneOtpSms, formatPhoneNumberE164, formatPhoneNumberForVietnam } from '../../infrastructure/sms/sms.service.js';
import { AppError } from '../../shared/errors/app-error.js';
import { OtpRequest } from '../otp_requests/otp_requests.model.js';
import { RefreshToken } from '../refresh_tokens/refresh_tokens.model.js';
import { User } from '../users/users.model.js';
import type {
  GoogleAuthResult,
  GoogleLoginResponse,
  GoogleRedirectResult,
  GoogleUserProfile,
  VerifyOtpResponse,
  RegisterDTO,
  RegisterResponse,
  PendingRegistration,
  RegistrationChallenge,
  VerifyRegistrationOtpDTO,
  LoginDTO,
  LoginResponse,
  AuthSessionResponse,
  ForgotPasswordResponse,
  VerifyResetCodeDTO,
  VerifyResetCodeResponse,
  ResetPasswordDTO,
  RefreshTokenResponse,
} from './domain/auth.types.js';

const googleClient = new OAuth2Client(env.googleClientId);

/** Các trường của document User mà AuthService sử dụng (model User đang khai báo kiểu any) */
interface UserDocument {
  _id: unknown;
  email: string;
  fullName: string;
  phone?: string;
  role: string;
  avatar?: string;
  status: string;
  lock?: { until?: Date };
}

/** Khoảng chờ tối thiểu giữa hai lần gửi mã đăng ký cho cùng một email */
const REGISTER_OTP_RESEND_SECONDS = 60;
/** Khoảng chờ tối thiểu giữa hai lần gửi mã đặt lại mật khẩu cho cùng một email */
const RESET_OTP_RESEND_SECONDS = 60;
/** Thời hạn của resetToken sau khi xác minh mã — đủ để người dùng nhập mật khẩu mới */
const RESET_TOKEN_EXPIRES_IN = '15m';
/** Hạn của mã đổi sau đăng nhập Google — Frontend đổi ngay khi được chuyển về nên chỉ cần ngắn */
const GOOGLE_LOGIN_CODE_TTL_SECONDS = 60;

interface TempTokenPayload {
  email: string;
  type: 'google_2fa_pending';
  /** Có khi token sinh từ endpoint dev (user đã tồn tại) */
  userId?: string;
  /** Có khi Gmail chưa đăng ký — dùng để tạo tài khoản sau khi xác minh OTP */
  profile?: { fullName: string; avatar?: string | undefined; googleId: string };
}

interface ResetTokenPayload {
  /** _id của bản ghi OtpRequest đã xác minh — đánh dấu đã dùng khi đổi mật khẩu để token chỉ dùng được một lần */
  otpId: string;
  email: string;
  type: 'password_reset';
}

export class AuthService {
  /**
   * Cấp Access Token + Refresh Token cho user và trả về phiên đăng nhập
   */
  private async issueSession(user: UserDocument): Promise<AuthSessionResponse> {
    const accessToken = jwt.sign(
      {
        userId: String(user._id),
        email: user.email,
        role: user.role,
      },
      env.jwtAccessSecret,
      { expiresIn: env.jwtAccessExpiresIn } as jwt.SignOptions
    );

    const refreshToken = jwt.sign(
      {
        userId: String(user._id),
        jti: crypto.randomUUID(),
      },
      env.jwtRefreshSecret,
      { expiresIn: env.jwtRefreshExpiresIn } as jwt.SignOptions
    );

    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: refreshExpiresAt,
    });

    return {
      user: {
        id: String(user._id),
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  /** Chặn đăng nhập nếu tài khoản bị khóa vĩnh viễn hoặc tạm thời */
  private assertUserActive(user: UserDocument): void {
    if (user.status !== 'ACTIVE') {
      throw new AppError(403, 'USER_INACTIVE', 'Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động.');
    }

    if (user.lock?.until && new Date(user.lock.until) > new Date()) {
      throw new AppError(
        403,
        'USER_LOCKED',
        `Tài khoản tạm thời bị khóa đến: ${new Date(user.lock.until).toLocaleString('vi-VN')}`
      );
    }
  }

  /**
   * Xác minh Google ID Token và lấy thông tin hồ sơ Google
   */
  private async verifyGoogleIdToken(idToken: string): Promise<GoogleUserProfile> {
    if (!env.googleClientId) {
      throw new AppError(500, 'CONFIG_ERROR', 'GOOGLE_CLIENT_ID chưa được cấu hình.');
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: env.googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Google ID Token không hợp lệ hoặc đã hết hạn.');
    }

    if (!payload || !payload.email) {
      throw new AppError(400, 'GOOGLE_AUTH_FAILED', 'Không lấy được thông tin email từ Google.');
    }

    // Tài khoản đã đăng ký được vào thẳng không cần OTP, nên bắt buộc Google đã xác minh email —
    // nếu không, ai đó có thể tạo tài khoản Google bằng email người khác để chiếm tài khoản ToyFlow
    if (!payload.email_verified) {
      throw new AppError(403, 'GOOGLE_EMAIL_UNVERIFIED', 'Email của tài khoản Google này chưa được xác minh.');
    }

    return {
      email: payload.email.toLowerCase(),
      name: payload.name || 'Người dùng Google',
      picture: payload.picture,
      googleId: payload.sub,
    };
  }

  /**
   * Tìm tài khoản đã đăng ký ứng với hồ sơ Google (theo email hoặc googleId) và liên kết Google nếu chưa có
   */
  private async findRegisteredGoogleUser(profile: GoogleUserProfile): Promise<UserDocument | null> {
    const user = await User.findOne({ $or: [{ email: profile.email }, { googleId: profile.googleId }] });
    if (!user) {
      return null;
    }

    let updated = false;
    if (!user.googleId) {
      user.googleId = profile.googleId;
      updated = true;
    }
    if (profile.picture && !user.avatar) {
      user.avatar = profile.picture;
      updated = true;
    }
    if (updated) {
      await user.save();
    }

    this.assertUserActive(user);
    return user;
  }

  /**
   * Gmail chưa đăng ký: gửi OTP về Gmail và cấp tempToken mang theo hồ sơ Google.
   * Tài khoản chỉ được tạo sau khi xác minh OTP thành công (xem verifyGoogleOtp)
   */
  private async startGoogleSignup(profile: GoogleUserProfile): Promise<GoogleLoginResponse> {
    await this.sendGoogleOtp(profile.email);

    const payload: TempTokenPayload = {
      email: profile.email,
      type: 'google_2fa_pending',
      profile: { fullName: profile.name, avatar: profile.picture, googleId: profile.googleId },
    };
    const tempToken = jwt.sign(payload, env.jwtAccessSecret, { expiresIn: '5m' });

    return {
      step: '2FA_OTP_REQUIRED',
      tempToken,
      email: profile.email,
      message: `Mã OTP xác thực đã được gửi tới địa chỉ email: ${profile.email}`,
    };
  }

  /** Sinh OTP 6 số (hạn 5 phút), lưu DB và gửi về Gmail */
  private async sendGoogleOtp(email: string): Promise<void> {
    const otpCode = crypto.randomInt(100_000, 1_000_000).toString();

    await OtpRequest.create({
      identifier: email,
      otp_code: otpCode,
      purpose: 'google_login_2fa',
      is_used: false,
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
      purgeAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    try {
      await sendOtpEmail(email, otpCode);
    } catch (mailError) {
      console.error('Lỗi khi gửi mail OTP:', mailError);
      throw new AppError(500, 'MAIL_SEND_FAILED', 'Không thể gửi mã OTP tới email của bạn. Vui lòng thử lại sau.');
    }
  }

  /**
   * Đăng nhập Google qua Direct API (frontend gửi ID Token):
   * - Gmail đã đăng ký → vào thẳng, trả về phiên đăng nhập
   * - Gmail chưa đăng ký → gửi OTP, trả về tempToken
   */
  public async loginWithGoogle(idToken: string): Promise<GoogleAuthResult> {
    const profile = await this.verifyGoogleIdToken(idToken);
    const user = await this.findRegisteredGoogleUser(profile);

    if (user) {
      return { step: 'AUTHENTICATED', ...(await this.issueSession(user)) };
    }
    return this.startGoogleSignup(profile);
  }

  /**
   * Đăng nhập Google qua Web Redirect. Với Gmail đã đăng ký, trả về mã đổi dùng một lần thay vì
   * đặt access/refresh token trực tiếp lên URL (lộ qua lịch sử trình duyệt, log)
   */
  public async handleGoogleRedirectLogin(idToken: string): Promise<GoogleRedirectResult> {
    const profile = await this.verifyGoogleIdToken(idToken);
    const user = await this.findRegisteredGoogleUser(profile);

    if (!user) {
      return this.startGoogleSignup(profile);
    }

    const loginCode = crypto.randomBytes(32).toString('hex');
    await OtpRequest.create({
      identifier: user.email,
      otp_code: loginCode,
      purpose: 'google_login_exchange',
      is_used: false,
      expires_at: new Date(Date.now() + GOOGLE_LOGIN_CODE_TTL_SECONDS * 1000),
      purgeAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    return { step: 'AUTHENTICATED', loginCode };
  }

  /**
   * Đổi mã đăng nhập Google lấy phiên đăng nhập — mỗi mã chỉ dùng được một lần
   */
  public async exchangeGoogleLoginCode(code: string): Promise<AuthSessionResponse> {
    const record = await OtpRequest.findOneAndUpdate(
      {
        otp_code: code,
        purpose: 'google_login_exchange',
        is_used: false,
        expires_at: { $gt: new Date() },
      },
      { is_used: true }
    );
    if (!record) {
      throw new AppError(401, 'INVALID_GOOGLE_LOGIN_CODE', 'Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.');
    }

    const user = await User.findOne({ email: record.identifier });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy thông tin người dùng.');
    }
    this.assertUserActive(user);

    return this.issueSession(user);
  }

  /**
   * Xác minh mã OTP gửi về Gmail: tạo tài khoản mới từ hồ sơ Google (nếu chưa có) và đăng nhập
   */
  public async verifyGoogleOtp(tempToken: string, otpCode: string): Promise<VerifyOtpResponse> {
    // 1. Kiểm tra tính hợp lệ của tempToken
    const decoded = this.decodeGoogleTempToken(tempToken);

    // 2. Đánh dấu OTP đã dùng một cách nguyên tử (gửi trùng sẽ không khớp lần hai)
    const otpRecord = await OtpRequest.findOneAndUpdate(
      {
        identifier: decoded.email,
        otp_code: otpCode,
        purpose: 'google_login_2fa',
        is_used: false,
        expires_at: { $gt: new Date() },
      },
      { is_used: true }
    );

    if (!otpRecord) {
      throw new AppError(400, 'INVALID_OTP', 'Mã OTP không chính xác hoặc đã hết hạn.');
    }

    // 3. Lấy hoặc tạo User. Token từ endpoint dev mang userId; token đăng ký Google mang hồ sơ Google
    let user = decoded.userId
      ? await User.findById(decoded.userId)
      : await User.findOne({ email: decoded.email });

    if (!user && decoded.profile) {
      const randomPhone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;
      const dummyPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);

      user = await User.create({
        email: decoded.email,
        fullName: decoded.profile.fullName,
        phone: randomPhone,
        passwordHash: dummyPasswordHash,
        avatar: decoded.profile.avatar,
        googleId: decoded.profile.googleId,
        role: 'USER',
        status: 'ACTIVE',
      });
    }

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy thông tin người dùng.');
    }
    this.assertUserActive(user);

    // 4. Cấp Access Token và Refresh Token chính thức
    return this.issueSession(user);
  }

  /**
   * Gửi lại mã OTP nếu chưa nhận được hoặc hết hạn
   */
  public async resendGoogleOtp(tempToken: string): Promise<{ message: string }> {
    const decoded = this.decodeGoogleTempToken(tempToken);
    await this.sendGoogleOtp(decoded.email);

    return {
      message: `Đã gửi lại mã OTP mới đến email: ${decoded.email}`,
    };
  }

  private decodeGoogleTempToken(tempToken: string): TempTokenPayload {
    let decoded: TempTokenPayload;
    try {
      decoded = jwt.verify(tempToken, env.jwtAccessSecret) as TempTokenPayload;
    } catch {
      throw new AppError(401, 'INVALID_TEMP_TOKEN', 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.');
    }

    if (decoded.type !== 'google_2fa_pending') {
      throw new AppError(400, 'INVALID_TOKEN_TYPE', 'Loại token không hợp lệ.');
    }
    return decoded;
  }

  /**
   * Endpoint hỗ trợ Test trên Thunder Client / Postman (chỉ hoạt động ở development)
   * Nhập thẳng email để server gửi OTP thật về Gmail mà không cần Google idToken
   */
  public async devLoginWithEmail(email: string): Promise<GoogleLoginResponse> {
    if (env.nodeEnv !== 'development') {
      throw new AppError(403, 'FORBIDDEN', 'Chức năng chỉ hỗ trợ ở môi trường development.');
    }

    let user = await User.findOne({ email });
    if (!user) {
      const randomPhone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;
      const dummyPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);

      user = await User.create({
        email,
        fullName: 'Test User',
        phone: randomPhone,
        passwordHash: dummyPasswordHash,
        role: 'USER',
        status: 'ACTIVE',
      });
    }

    const otpCode = Math.floor(100_000 + Math.random() * 900_000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const purgeAt = new Date(Date.now() + 10 * 60 * 1000);

    await OtpRequest.create({
      identifier: email,
      otp_code: otpCode,
      purpose: 'google_login_2fa',
      is_used: false,
      expires_at: expiresAt,
      purgeAt,
    });

    await sendOtpEmail(email, otpCode);

    const tempToken = jwt.sign(
      { userId: String(user._id), email, type: 'google_2fa_pending' },
      env.jwtAccessSecret,
      { expiresIn: '5m' }
    );

    return {
      step: '2FA_OTP_REQUIRED',
      tempToken,
      email,
      message: `[DEV TEST] Mã OTP xác thực đã được gửi tới Gmail: ${email}`,
    };
  }

  /**
   * Bước 1 đăng ký: kiểm tra trùng, lưu thông tin chờ xác minh kèm OTP và gửi mã về Email.
   * Chưa tạo User ở bước này — chỉ tạo sau khi nhập đúng mã (xem verifyRegistrationOtp)
   */
  public async register(dto: RegisterDTO): Promise<RegistrationChallenge> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const normalizedPhone = dto.phone.trim();

    await this.assertRegistrationAvailable(normalizedEmail, normalizedPhone);

    const pending: PendingRegistration = {
      fullName: dto.fullName.trim(),
      phone: normalizedPhone,
      passwordHash: await bcrypt.hash(dto.password, 10),
    };

    await this.sendRegistrationOtp(normalizedEmail, pending);

    return {
      email: normalizedEmail,
      resendAfterSeconds: REGISTER_OTP_RESEND_SECONDS,
      message: `Mã xác minh đã được gửi tới email: ${normalizedEmail}`,
    };
  }

  /**
   * Bước 2 đăng ký: xác minh OTP rồi mới tạo tài khoản. Không tự đăng nhập —
   * người dùng quay về trang đăng nhập sau khi đăng ký thành công
   */
  public async verifyRegistrationOtp(dto: VerifyRegistrationOtpDTO): Promise<RegisterResponse> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // Đánh dấu OTP đã dùng một cách nguyên tử — gửi trùng sẽ không khớp lần hai
    const otpRecord = await OtpRequest.findOneAndUpdate(
      {
        identifier: normalizedEmail,
        otp_code: dto.otpCode,
        purpose: 'register',
        is_used: false,
        expires_at: { $gt: new Date() },
      },
      { is_used: true }
    );

    if (!otpRecord?.payload) {
      throw new AppError(400, 'INVALID_OTP', 'Mã OTP không chính xác hoặc đã hết hạn.');
    }

    const pending = otpRecord.payload as PendingRegistration;

    // Kiểm tra lại vì email/SĐT có thể đã bị người khác đăng ký trong lúc chờ nhập mã
    await this.assertRegistrationAvailable(normalizedEmail, pending.phone);

    const user = await User.create({
      email: normalizedEmail,
      fullName: pending.fullName,
      phone: pending.phone,
      passwordHash: pending.passwordHash,
      role: 'USER',
      status: 'ACTIVE',
    });

    return {
      user: {
        id: String(user._id),
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  /**
   * Gửi lại mã đăng ký, dùng lại thông tin đăng ký đang chờ xác minh gần nhất
   */
  public async resendRegistrationOtp(email: string): Promise<RegistrationChallenge> {
    const normalizedEmail = email.toLowerCase().trim();

    const latest = await OtpRequest.findOne({ identifier: normalizedEmail, purpose: 'register', is_used: false }).sort({
      createdAt: -1,
    });
    if (!latest?.payload) {
      throw new AppError(400, 'REGISTRATION_EXPIRED', 'Phiên đăng ký đã hết hạn. Vui lòng điền lại thông tin đăng ký.');
    }

    const waitSeconds = Math.ceil(
      (new Date(latest.createdAt).getTime() + REGISTER_OTP_RESEND_SECONDS * 1000 - Date.now()) / 1000
    );
    if (waitSeconds > 0) {
      throw new AppError(429, 'OTP_RESEND_TOO_SOON', `Vui lòng chờ ${waitSeconds} giây trước khi gửi lại mã.`);
    }

    await this.sendRegistrationOtp(normalizedEmail, latest.payload as PendingRegistration);

    return {
      email: normalizedEmail,
      resendAfterSeconds: REGISTER_OTP_RESEND_SECONDS,
      message: `Đã gửi lại mã xác minh tới email: ${normalizedEmail}`,
    };
  }

  /** Chặn đăng ký nếu email hoặc số điện thoại đã thuộc về một tài khoản */
  private async assertRegistrationAvailable(email: string, phone: string): Promise<void> {
    if (await User.exists({ email })) {
      throw new AppError(409, 'EMAIL_EXISTS', 'Email này đã được sử dụng. Vui lòng chọn email khác.');
    }
    if (await User.exists({ phone })) {
      throw new AppError(409, 'PHONE_EXISTS', 'Số điện thoại này đã được sử dụng.');
    }
  }

  /** Sinh OTP đăng ký (hạn 10 phút), lưu kèm thông tin chờ xác minh và gửi về Email */
  private async sendRegistrationOtp(email: string, pending: PendingRegistration): Promise<void> {
    const otpCode = crypto.randomInt(100_000, 1_000_000).toString();

    await OtpRequest.create({
      identifier: email,
      otp_code: otpCode,
      purpose: 'register',
      is_used: false,
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
      purgeAt: new Date(Date.now() + 30 * 60 * 1000),
      payload: pending,
    });

    try {
      await sendOtpEmail(email, otpCode, 'register');
    } catch (error) {
      console.error('Lỗi gửi email OTP đăng ký:', error);
      throw new AppError(500, 'MAIL_SEND_FAILED', 'Không thể gửi mã xác minh tới email của bạn. Vui lòng thử lại sau.');
    }
  }

  /**
   * Đăng nhập bằng Email hoặc Số điện thoại + Mật khẩu
   */
  public async login(dto: LoginDTO): Promise<LoginResponse> {
    const identifier = dto.identifier.trim();
    const query = identifier.includes('@') ? { email: identifier.toLowerCase() } : { phone: identifier };

    // Dùng chung một thông báo lỗi để không lộ việc tài khoản có tồn tại hay không
    const user = await User.findOne(query);
    const isPasswordValid = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !isPasswordValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Số điện thoại/email hoặc mật khẩu không chính xác.');
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError(403, 'USER_INACTIVE', 'Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động.');
    }

    return this.issueSession(user);
  }

  /**
   * Bước 1 quên mật khẩu: gửi mã OTP / Link đặt lại mật khẩu về Email
   */
  public async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    const normalizedEmail = email.toLowerCase().trim();

    // Nguyên tắc bảo mật chống dò email: dù email có tồn tại hay không, phản hồi luôn giống nhau
    const response: ForgotPasswordResponse = {
      email: normalizedEmail,
      resendAfterSeconds: RESET_OTP_RESEND_SECONDS,
      message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hòm thư của bạn.',
    };

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return response;
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError(403, 'USER_INACTIVE', 'Tài khoản của bạn đã bị khóa hoặc ngừng hoạt động.');
    }

    // Chặn spam email: vừa gửi trong khoảng chờ thì bỏ qua, vẫn trả phản hồi như bình thường
    const recentOtp = await OtpRequest.exists({
      identifier: normalizedEmail,
      purpose: 'reset_password',
      createdAt: { $gt: new Date(Date.now() - RESET_OTP_RESEND_SECONDS * 1000) },
    });
    if (recentOtp) {
      return response;
    }

    // Sinh mã OTP 6 số (hạn 10 phút). Giữ bản ghi lâu hơn hạn resetToken để bước đổi mật khẩu còn tìm thấy
    const otpCode = crypto.randomInt(100_000, 1_000_000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const purgeAt = new Date(Date.now() + 30 * 60 * 1000);

    await OtpRequest.create({
      identifier: normalizedEmail,
      otp_code: otpCode,
      purpose: 'reset_password',
      is_used: false,
      expires_at: expiresAt,
      purgeAt,
    });

    // Link trỏ về trang Quên mật khẩu của Frontend, điền sẵn email và mã
    const resetLink = `${env.corsOrigin}/forgot-password?email=${encodeURIComponent(normalizedEmail)}&otp=${otpCode}`;

    try {
      await sendResetPasswordEmail(normalizedEmail, otpCode, resetLink);
    } catch (error) {
      console.error('Lỗi gửi email reset password:', error);
      throw new AppError(500, 'MAIL_SEND_FAILED', 'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.');
    }

    return response;
  }

  /**
   * Bước 2 quên mật khẩu: xác minh mã OTP, cấp resetToken ngắn hạn để đặt mật khẩu mới
   */
  public async verifyResetCode(dto: VerifyResetCodeDTO): Promise<VerifyResetCodeResponse> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const otpRecord = await OtpRequest.findOne({
      identifier: normalizedEmail,
      otp_code: dto.otpCode,
      purpose: 'reset_password',
      is_used: false,
      expires_at: { $gt: new Date() },
    });

    if (!otpRecord) {
      throw new AppError(400, 'INVALID_OTP', 'Mã OTP không chính xác hoặc đã hết hạn.');
    }

    // Chưa đánh dấu OTP đã dùng ở đây: resetPassword sẽ làm, nhờ đó resetToken chỉ dùng được một lần
    const payload: ResetTokenPayload = {
      otpId: String(otpRecord._id),
      email: normalizedEmail,
      type: 'password_reset',
    };
    const resetToken = jwt.sign(payload, env.jwtAccessSecret, {
      expiresIn: RESET_TOKEN_EXPIRES_IN,
    } as jwt.SignOptions);

    return { resetToken };
  }

  /**
   * Bước 3 quên mật khẩu: đặt mật khẩu mới bằng resetToken
   */
  public async resetPassword(dto: ResetPasswordDTO): Promise<{ message: string }> {
    // 1. Kiểm tra resetToken
    let decoded: ResetTokenPayload;
    try {
      decoded = jwt.verify(dto.resetToken, env.jwtAccessSecret) as ResetTokenPayload;
    } catch {
      throw new AppError(401, 'INVALID_RESET_TOKEN', 'Phiên đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu mã mới.');
    }

    if (decoded.type !== 'password_reset') {
      throw new AppError(400, 'INVALID_TOKEN_TYPE', 'Loại token không hợp lệ.');
    }

    // 2. Đánh dấu OTP đã dùng một cách nguyên tử — token đã dùng rồi (hoặc gửi trùng) sẽ không khớp
    const otpRecord = await OtpRequest.findOneAndUpdate(
      { _id: decoded.otpId, identifier: decoded.email, purpose: 'reset_password', is_used: false },
      { is_used: true }
    );
    if (!otpRecord) {
      throw new AppError(401, 'INVALID_RESET_TOKEN', 'Phiên đặt lại mật khẩu đã được sử dụng hoặc hết hạn.');
    }

    // 3. Tìm User
    const user = await User.findOne({ email: decoded.email });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy người dùng tương ứng.');
    }

    // 4. Hash mật khẩu mới và cập nhật
    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await user.save();

    // 5. Thu hồi toàn bộ Refresh Token cũ của người dùng (buộc đăng xuất khỏi mọi thiết bị)
    await RefreshToken.deleteMany({ userId: user._id });

    return {
      message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.',
    };
  }

  /**
   * Làm mới Access Token bằng Refresh Token (Token Rotation)
   */
  public async refreshToken(token: string): Promise<RefreshTokenResponse> {
    // 1. Kiểm tra tính hợp lệ của Refresh Token trong Database
    const storedToken = await RefreshToken.findOne({ token });
    if (!storedToken) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ hoặc đã bị thu hồi.');
    }

    // 2. Verify chữ ký JWT của token
    let decoded: { userId: string };
    try {
      decoded = jwt.verify(token, env.jwtRefreshSecret) as { userId: string };
    } catch {
      // Nếu token hết hạn hoặc sai chữ ký, xóa khỏi DB luôn
      await RefreshToken.deleteOne({ token });
      throw new AppError(401, 'EXPIRED_REFRESH_TOKEN', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }

    // 3. Kiểm tra User có còn active không
    const user = await User.findById(decoded.userId);
    if (!user || user.status !== 'ACTIVE') {
      await RefreshToken.deleteOne({ token });
      throw new AppError(403, 'USER_INACTIVE', 'Tài khoản không tồn tại hoặc đã bị khóa.');
    }

    // 4. Token Rotation: Xóa token cũ và cấp token mới
    await RefreshToken.deleteOne({ token });

    const newAccessToken = jwt.sign(
      {
        userId: String(user._id),
        email: user.email,
        role: user.role,
      },
      env.jwtAccessSecret,
      { expiresIn: env.jwtAccessExpiresIn } as jwt.SignOptions
    );

    const newRefreshToken = jwt.sign(
      {
        userId: String(user._id),
        jti: crypto.randomUUID(),
      },
      env.jwtRefreshSecret,
      { expiresIn: env.jwtRefreshExpiresIn } as jwt.SignOptions
    );

    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({
      userId: user._id,
      token: newRefreshToken,
      expiresAt: refreshExpiresAt,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Đăng xuất tài khoản (Xóa Refresh Token khỏi DB)
   */
  public async logout(token: string, allDevices = false): Promise<{ message: string }> {
    if (allDevices) {
      try {
        const decoded = jwt.decode(token) as { userId?: string } | null;
        if (decoded?.userId) {
          await RefreshToken.deleteMany({ userId: decoded.userId });
          return { message: 'Đã đăng xuất thành công khỏi tất cả các thiết bị!' };
        }
      } catch {
        // Fallback xóa token đơn lẻ nếu decode lỗi
      }
    }

    await RefreshToken.deleteOne({ token });
    return {
      message: 'Đăng xuất thành công!',
    };
  }

  /**
   * Gửi mã OTP xác minh số điện thoại
   */
  public async sendPhoneOtp(
    phone: string
  ): Promise<{ phone: string; resendAfterSeconds: number; message: string; devOtpCode?: string }> {
    const formattedPhone = formatPhoneNumberE164(phone);
    const localPhone = formatPhoneNumberForVietnam(phone);
    const phoneVariants = [formattedPhone, localPhone];

    // 1. Kiểm tra xem số điện thoại này đã được xác minh thành công trước đó hay chưa
    const alreadyVerifiedUser = await User.findOne({
      phone: { $in: phoneVariants },
      isPhoneVerified: true,
    });

    const alreadyVerifiedOtp = await OtpRequest.findOne({
      identifier: { $in: phoneVariants },
      purpose: 'phone_verification',
      is_used: true,
    });

    if (alreadyVerifiedUser || alreadyVerifiedOtp) {
      throw new AppError(
        400,
        'PHONE_ALREADY_VERIFIED',
        'Số điện thoại này đã được xác minh thành công trước đó. Không thể gửi lại mã OTP.'
      );
    }

    // 2. Chống spam: kiểm tra yêu cầu gần nhất trong vòng 60 giây
    const recentOtp = await OtpRequest.findOne({
      identifier: { $in: phoneVariants },
      purpose: 'phone_verification',
      createdAt: { $gt: new Date(Date.now() - 60 * 1000) },
    });
    if (recentOtp) {
      throw new AppError(429, 'OTP_RATE_LIMITED', 'Vui lòng đợi 60 giây trước khi yêu cầu gửi lại mã.');
    }

    const otpCode = crypto.randomInt(100_000, 1_000_000).toString();

    const otpRecord = await OtpRequest.create({
      phone: localPhone,
      identifier: localPhone,
      otp_code: otpCode,
      purpose: 'phone_verification',
      is_used: false,
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
      purgeAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    try {
      await sendPhoneOtpSms(localPhone, otpCode);
    } catch (err) {
      await OtpRequest.deleteOne({ _id: otpRecord._id }).catch(() => {});
      throw err;
    }

    return {
      phone: localPhone,
      resendAfterSeconds: 60,
      message: `Mã OTP đã được gửi về số điện thoại ${localPhone}`,
      ...(env.nodeEnv === 'development' ? { devOtpCode: otpCode } : {}),
    };
  }

  /**
   * Xác thực mã OTP số điện thoại
   */
  public async verifyPhoneOtp(
    phone: string,
    otpCode: string
  ): Promise<{ verified: boolean; phone: string; message: string }> {
    const formattedPhone = formatPhoneNumberE164(phone);
    const localPhone = formatPhoneNumberForVietnam(phone);
    const phoneVariants = [formattedPhone, localPhone];

    // Kiểm tra xem số điện thoại đã xác minh trước đó hay chưa
    const alreadyVerifiedUser = await User.findOne({
      phone: { $in: phoneVariants },
      isPhoneVerified: true,
    });
    const alreadyVerifiedOtp = await OtpRequest.findOne({
      identifier: { $in: phoneVariants },
      purpose: 'phone_verification',
      is_used: true,
    });

    if (alreadyVerifiedUser || alreadyVerifiedOtp) {
      throw new AppError(
        400,
        'PHONE_ALREADY_VERIFIED',
        'Số điện thoại này đã được xác minh thành công trước đó.'
      );
    }

    const otpRecord = await OtpRequest.findOneAndUpdate(
      {
        identifier: { $in: phoneVariants },
        otp_code: otpCode,
        purpose: 'phone_verification',
        is_used: false,
        expires_at: { $gt: new Date() },
      },
      {
        $set: {
          is_used: true,
          // Bỏ purgeAt để giữ lại vĩnh viễn mốc đã xác minh thành công, ngăn gửi lại mã trong tương lai
          purgeAt: null,
        },
      }
    );

    if (!otpRecord) {
      throw new AppError(400, 'INVALID_OTP', 'Mã OTP không chính xác hoặc đã hết hạn.');
    }

    // Đánh dấu số điện thoại đã xác minh cho User nếu tài khoản đã tồn tại
    await User.updateMany(
      { phone: { $in: phoneVariants } },
      { $set: { isPhoneVerified: true } }
    );

    return {
      verified: true,
      phone: localPhone,
      message: 'Xác minh số điện thoại thành công!',
    };
  }
}

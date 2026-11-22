import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import type { AuthMailer } from '../interfaces/auth.ports.js';
import { AppError } from '../utils/app-error.js';
import { phoneLookupForms } from '../utils/phone.js';
import { OtpRequest } from '../models/otp-request.model.js';
import { RefreshToken } from '../models/refresh-token.model.js';
import { assertNotAdminLocked } from './account-lock.service.js';
import { User } from '../models/user.model.js';
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
} from '../types/auth.types.js';

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
  lock?: { until?: Date; reason?: string };
}

/** Khoảng chờ tối thiểu giữa hai lần gửi mã đăng ký cho cùng một email */
const REGISTER_OTP_RESEND_SECONDS = 60;
/** Khoảng chờ tối thiểu giữa hai lần gửi mã đặt lại mật khẩu cho cùng một email */
const RESET_OTP_RESEND_SECONDS = 60;
/** Thời hạn của resetToken sau khi xác minh mã — đủ để người dùng nhập mật khẩu mới */
const RESET_TOKEN_EXPIRES_IN = '15m';
/** Hạn của mã đổi sau đăng nhập Google — Frontend đổi ngay khi được chuyển về nên chỉ cần ngắn */
const GOOGLE_LOGIN_CODE_TTL_SECONDS = 60;

/** Chỉ lưu SHA-256 của Refresh Token trong DB (R04 III.1.1) — lộ DB cũng không dùng được token */
const hashRefreshToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

/** GB-03: 5 consecutive failed sign-ins lock the account for 15 minutes (MSG13). */
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const LOCKED_MESSAGE = 'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.';

/**
 * Failed sign-ins for identifiers without an account, kept in memory only so that the answer for
 * an unknown account looks the same as for a wrong password (GB-04).
 */
const unknownFailures = new Map<string, { count: number; at: number; lockedUntil?: number }>();
const isUnknownLocked = (identifier: string): boolean =>
  (unknownFailures.get(identifier.toLowerCase())?.lockedUntil ?? 0) > Date.now();
const recordUnknownFailure = (identifier: string): number => {
  const key = identifier.toLowerCase();
  const now = Date.now();
  const previous = unknownFailures.get(key);
  const count = previous && now - previous.at < LOCK_MINUTES * 60_000 ? previous.count + 1 : 1;
  if (unknownFailures.size > 10_000) unknownFailures.clear();
  unknownFailures.set(
    key,
    count >= MAX_FAILED_LOGINS
      ? { count: 0, at: now, lockedUntil: now + LOCK_MINUTES * 60_000 }
      : { count, at: now },
  );
  return count;
};

/**
 * GB-02: an OTP expires after 5 minutes and at most 5 codes are sent per hour to one email (per
 * purpose). Records are kept a little over an hour so the hourly count still sees them.
 * R03 III.1.1.1 (14): 5 wrong codes in a row cancel the active code.
 */
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_PURGE_MS = 65 * 60 * 1000;
const OTP_HOURLY_LIMIT = 5;
const OTP_MAX_WRONG_ATTEMPTS = 5;
/** Thông tin đăng ký đang chờ xác minh còn dùng để gửi lại mã trong 1 giờ kể từ lần gửi mã cuối */
const REGISTRATION_PENDING_MS = 60 * 60 * 1000;

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

/** True only when NODE_ENV is "development" in the process environment (no default). */
export const isExplicitDevelopment = (): boolean =>
  process.env.NODE_ENV === 'development' && env.nodeEnv === 'development';

export class AuthService {
  public constructor(private readonly mailer: AuthMailer) {}

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

    const refreshToken = await this.createRefreshToken(user._id);

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

  /**
   * Ký Refresh Token mới và lưu hash của nó; hạn của bản ghi lấy từ chính `exp` của token
   * để DB (TTL index) và JWT luôn hết hạn cùng lúc
   */
  private async createRefreshToken(userId: unknown): Promise<string> {
    const refreshToken = jwt.sign(
      {
        userId: String(userId),
        jti: crypto.randomUUID(),
      },
      env.jwtRefreshSecret,
      { expiresIn: env.jwtRefreshExpiresIn } as jwt.SignOptions
    );

    const { exp } = jwt.decode(refreshToken) as { exp: number };
    await RefreshToken.create({
      userId,
      token: hashRefreshToken(refreshToken),
      expiresAt: new Date(exp * 1000),
    });

    return refreshToken;
  }

  /** GB-02: refuses a 6th code within one hour for the same email and purpose (no email is sent) */
  private async assertOtpHourlyLimit(identifier: string, purpose: string): Promise<void> {
    const sentInLastHour = await OtpRequest.countDocuments({
      identifier,
      purpose,
      createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    if (sentInLastHour >= OTP_HOURLY_LIMIT) {
      throw new AppError(
        429,
        'OTP_HOURLY_LIMIT',
        'Bạn đã yêu cầu quá 5 mã xác minh trong một giờ. Vui lòng thử lại sau.',
      );
    }
  }

  /** A wrong code counts against every active code of the email; the 5th wrong code cancels them */
  private async recordWrongOtp(identifier: string, purpose: string): Promise<void> {
    const active = { identifier, purpose, is_used: false, expires_at: { $gt: new Date() } };
    await OtpRequest.updateMany(active, { $inc: { attempts: 1 } });
    await OtpRequest.updateMany(
      { ...active, attempts: { $gte: OTP_MAX_WRONG_ATTEMPTS } },
      { $set: { is_used: true } },
    );
  }

  /** Chặn đăng nhập nếu tài khoản bị khóa vĩnh viễn hoặc tạm thời */
  private assertUserActive(user: UserDocument): void {
    // Khóa bởi Admin (UC29): báo lý do khóa (MSG12); khóa có thời hạn đã hết thì cho qua
    assertNotAdminLocked(user);

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
    await this.assertOtpHourlyLimit(email, 'google_login_2fa');
    const otpCode = crypto.randomInt(100_000, 1_000_000).toString();

    await OtpRequest.create({
      identifier: email,
      otp_code: otpCode,
      purpose: 'google_login_2fa',
      is_used: false,
      expires_at: new Date(Date.now() + OTP_TTL_MS),
      purgeAt: new Date(Date.now() + OTP_PURGE_MS),
    });

    try {
      await this.mailer.sendOtpEmail(email, otpCode);
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
      await this.recordWrongOtp(decoded.email, 'google_login_2fa');
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
    // Only when NODE_ENV is set to "development" on purpose: env.nodeEnv falls back to
    // "development" when the variable is missing, and a host where it was forgotten must not
    // open this shortcut (R03 III.1.2.1 (10); R5.2 ITC_SEC_21).
    if (!isExplicitDevelopment()) {
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

    await this.mailer.sendOtpEmail(email, otpCode);

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
   * Bước 2 đăng ký: xác minh OTP rồi mới tạo tài khoản, sau đó đăng nhập luôn
   * (R03 UC01 bước 5: tạo tài khoản Active/Unverified và đăng nhập người dùng)
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
      await this.recordWrongOtp(normalizedEmail, 'register');
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

    return this.issueSession(user);
  }

  /**
   * Gửi lại mã đăng ký, dùng lại thông tin đăng ký đang chờ xác minh gần nhất.
   * Mã gần nhất có thể đã bị huỷ (5 lần sai, R03 III.1.1.1 (14)) hoặc đã hết hạn — thông tin đăng ký
   * vẫn còn dùng được trong REGISTRATION_PENDING_MS kể từ lần gửi mã cuối, nên vẫn gửi được mã mới
   */
  public async resendRegistrationOtp(email: string): Promise<RegistrationChallenge> {
    const normalizedEmail = email.toLowerCase().trim();

    const latest = await OtpRequest.findOne({
      identifier: normalizedEmail,
      purpose: 'register',
      createdAt: { $gt: new Date(Date.now() - REGISTRATION_PENDING_MS) },
    }).sort({ createdAt: -1 });
    if (!latest?.payload) {
      throw new AppError(400, 'REGISTRATION_EXPIRED', 'Phiên đăng ký đã hết hạn. Vui lòng điền lại thông tin đăng ký.');
    }
    const pending = latest.payload as PendingRegistration;
    // Mã gần nhất đã dùng để tạo tài khoản, hoặc email/SĐT vừa bị người khác đăng ký
    await this.assertRegistrationAvailable(normalizedEmail, pending.phone);

    const waitSeconds = Math.ceil(
      (new Date(latest.createdAt).getTime() + REGISTER_OTP_RESEND_SECONDS * 1000 - Date.now()) / 1000
    );
    if (waitSeconds > 0) {
      throw new AppError(429, 'OTP_RESEND_TOO_SOON', `Vui lòng chờ ${waitSeconds} giây trước khi gửi lại mã.`);
    }

    // A new code replaces the old one: earlier codes of this sign-up stop working
    await OtpRequest.updateMany(
      { identifier: normalizedEmail, purpose: 'register', is_used: false },
      { $set: { is_used: true } },
    );
    await this.sendRegistrationOtp(normalizedEmail, pending);

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
    // The same number in another form (0912... / +84912...) is the same phone
    const phoneForms = phoneLookupForms(phone);
    if (await User.exists({ phone: { $in: phoneForms.length > 0 ? phoneForms : [phone] } })) {
      throw new AppError(409, 'PHONE_EXISTS', 'Số điện thoại này đã được sử dụng.');
    }
  }

  /** Sinh OTP đăng ký (hạn 5 phút, tối đa 5 mã/giờ), lưu kèm thông tin chờ xác minh và gửi về Email */
  private async sendRegistrationOtp(email: string, pending: PendingRegistration): Promise<void> {
    await this.assertOtpHourlyLimit(email, 'register');
    const otpCode = crypto.randomInt(100_000, 1_000_000).toString();

    await OtpRequest.create({
      identifier: email,
      otp_code: otpCode,
      purpose: 'register',
      is_used: false,
      expires_at: new Date(Date.now() + OTP_TTL_MS),
      purgeAt: new Date(Date.now() + OTP_PURGE_MS),
      payload: pending,
    });

    try {
      await this.mailer.sendOtpEmail(email, otpCode, 'register');
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
    // A phone number may be typed as "0912 345 678" or "+84912345678" and stored as 0912... or +84...
    const phoneForms = identifier.includes('@') ? [] : phoneLookupForms(identifier);
    const query = identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { phone: { $in: phoneForms.length > 0 ? phoneForms : [identifier] } };
    const lockKey = phoneForms[0] ?? identifier;

    const user = await User.findOne(query);

    // An Admin lock (UC29) is status LOCKED with an optional lock.until; it is answered with MSG12 and
    // its reason after the password check (assertUserActive), not with the failed-sign-in message.
    const adminLocked = user?.status === 'LOCKED';

    // GB-03/GB-05: a timed lock after 5 failed sign-ins blocks password sign-in until lock.until;
    // when it has passed the account is unlocked again (JOB-01 behaviour).
    if (
      (!adminLocked && user?.lock?.until && new Date(user.lock.until) > new Date()) ||
      (!user && isUnknownLocked(lockKey))
    ) {
      throw new AppError(403, 'USER_LOCKED', LOCKED_MESSAGE);
    }

    const isPasswordValid = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !isPasswordValid) {
      // GB-04: one message for an unknown account and for a wrong password, with the attempts left.
      const failures = user ? await this.recordFailedLogin(user) : recordUnknownFailure(lockKey);
      if (failures >= MAX_FAILED_LOGINS) {
        throw new AppError(403, 'USER_LOCKED', LOCKED_MESSAGE);
      }
      const attemptsLeft = MAX_FAILED_LOGINS - failures;
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        `Số điện thoại/email hoặc mật khẩu không chính xác. Bạn còn ${attemptsLeft} lần thử.`,
        { attemptsLeft },
      );
    }

    // A temporary lock (lock.until) blocks a password sign-in too, not only Google (GB-03, GB-05)
    this.assertUserActive(user);

    if (user.failedLogins?.count || user.lock?.until) {
      // An Admin lock that has run out keeps its fields: the account-unlock job ends it (UC29).
      await User.updateOne(
        { _id: user._id },
        adminLocked
          ? { $set: { 'failedLogins.count': 0 } }
          : { $set: { 'failedLogins.count': 0 }, $unset: { 'lock.until': 1 } },
      );
    }

    return this.issueSession(user);
  }

  /** Adds one failed sign-in; the 5th in a row locks the account for 15 minutes (GB-03). */
  private async recordFailedLogin(user: UserDocument): Promise<number> {
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { 'failedLogins.count': 1 }, $set: { 'failedLogins.lastAt': new Date() } },
      { new: true },
    );
    const count = updated?.failedLogins?.count ?? 1;
    if (count >= MAX_FAILED_LOGINS) {
      // Never shorten or replace an Admin lock (status LOCKED) with the 15-minute lock.
      await User.updateOne(
        { _id: user._id, status: { $ne: 'LOCKED' } },
        { $set: { 'lock.until': new Date(Date.now() + LOCK_MINUTES * 60_000), 'failedLogins.count': 0 } },
      );
    }
    return count;
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

    await this.assertOtpHourlyLimit(normalizedEmail, 'reset_password');

    // Sinh mã OTP 6 số (hạn 5 phút). Giữ bản ghi lâu hơn hạn resetToken để bước đổi mật khẩu còn tìm thấy
    const otpCode = crypto.randomInt(100_000, 1_000_000).toString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const purgeAt = new Date(Date.now() + OTP_PURGE_MS);

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
      await this.mailer.sendResetPasswordEmail(normalizedEmail, otpCode, resetLink);
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
      await this.recordWrongOtp(normalizedEmail, 'reset_password');
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
    // 1. Lấy và xóa ngay bản ghi (theo hash) một cách nguyên tử — token cũ chỉ dùng được một lần,
    //    kể cả khi hai request làm mới gửi cùng lúc. Mọi nhánh lỗi bên dưới cũng đều thu hồi token này
    const storedToken = await RefreshToken.findOneAndDelete({ token: hashRefreshToken(token) });
    if (!storedToken) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ hoặc đã bị thu hồi.');
    }

    // 2. Verify chữ ký JWT của token
    let decoded: { userId: string };
    try {
      decoded = jwt.verify(token, env.jwtRefreshSecret) as { userId: string };
    } catch {
      // Token hết hạn hoặc sai chữ ký (bản ghi đã bị xóa ở bước 1)
      throw new AppError(401, 'EXPIRED_REFRESH_TOKEN', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }

    // 3. Kiểm tra User có còn active không
    const user = await User.findById(decoded.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError(403, 'USER_INACTIVE', 'Tài khoản không tồn tại hoặc đã bị khóa.');
    }

    // 4. Token Rotation: token cũ đã bị xóa ở bước 1, cấp token mới
    const newAccessToken = jwt.sign(
      {
        userId: String(user._id),
        email: user.email,
        role: user.role,
      },
      env.jwtAccessSecret,
      { expiresIn: env.jwtAccessExpiresIn } as jwt.SignOptions
    );

    const newRefreshToken = await this.createRefreshToken(user._id);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Đăng xuất tài khoản (Xóa Refresh Token khỏi DB).
   * Đăng xuất mọi thiết bị chỉ chạy với Refresh Token đúng chữ ký và còn trong DB — nếu không,
   * ai cũng có thể tự tạo token mang userId của người khác để đá họ khỏi mọi phiên
   */
  public async logout(token: string, allDevices = false): Promise<{ message: string }> {
    const tokenHash = hashRefreshToken(token);

    if (allDevices) {
      const invalid = new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ hoặc đã bị thu hồi.');
      let decoded: { userId?: string };
      try {
        decoded = jwt.verify(token, env.jwtRefreshSecret) as { userId?: string };
      } catch {
        throw invalid;
      }
      if (!decoded.userId || !(await RefreshToken.exists({ token: tokenHash, userId: decoded.userId }))) {
        throw invalid;
      }

      await RefreshToken.deleteMany({ userId: decoded.userId });
      return { message: 'Đã đăng xuất thành công khỏi tất cả các thiết bị!' };
    }

    // Đăng xuất một thiết bị: token lạ hoặc đã thu hồi thì không có gì để xóa (idempotent)
    await RefreshToken.deleteOne({ token: tokenHash });
    return {
      message: 'Đăng xuất thành công!',
    };
  }
}

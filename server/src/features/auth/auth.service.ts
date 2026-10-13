import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import { sendOtpEmail } from '../../infrastructure/email/mailer.js';
import { AppError } from '../../shared/errors/app-error.js';
import { OtpRequest } from '../otp_requests/otp_requests.model.js';
import { RefreshToken } from '../refresh_tokens/refresh_tokens.model.js';
import { User } from '../users/users.model.js';
import type {
  AuthenticatedUser,
  GoogleLoginResponse,
  VerifyOtpResponse,
} from './domain/auth.types.js';

const googleClient = new OAuth2Client(env.googleClientId);

interface TempTokenPayload {
  userId: string;
  email: string;
  type: string;
}

export class AuthService {
  /**
   * Bước 1: Xác minh Google ID Token, tìm/tạo user, sinh và gửi mã OTP qua Gmail
   */
  public async loginWithGoogle(idToken: string): Promise<GoogleLoginResponse> {
    if (!env.googleClientId) {
      throw new AppError(500, 'CONFIG_ERROR', 'GOOGLE_CLIENT_ID chưa được cấu hình.');
    }

    // 1. Xác minh Token với Google
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

    const { email, name, picture, sub: googleId } = payload;

    // 2. Tìm hoặc Tạo User mới tuân thủ Schema Validator của Atlas
    let user = await User.findOne({ $or: [{ email }, { googleId }] });

    if (!user) {
      const randomPhone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;
      const dummyPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);

      user = await User.create({
        email,
        fullName: name || 'Người dùng Google',
        phone: randomPhone,
        passwordHash: dummyPasswordHash,
        avatar: picture,
        googleId,
        role: 'USER',
        status: 'ACTIVE',
      });
    } else {
      let updated = false;
      if (!user.googleId) {
        user.googleId = googleId;
        updated = true;
      }
      if (picture && !user.avatar) {
        user.avatar = picture;
        updated = true;
      }
      if (updated) {
        await user.save();
      }
    }

    // 3. Kiểm tra trạng thái khóa tài khoản
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

    // 4. Sinh mã OTP 6 số ngẫu nhiên
    const otpCode = Math.floor(100_000 + Math.random() * 900_000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút
    const purgeAt = new Date(Date.now() + 10 * 60 * 1000); // TTL tự xóa sau 10 phút

    // Lưu OTP vào database
    await OtpRequest.create({
      identifier: email,
      otp_code: otpCode,
      purpose: 'google_login_2fa',
      is_used: false,
      expires_at: expiresAt,
      purgeAt,
    });

    // 5. Gửi Email OTP qua Gmail SMTP
    try {
      await sendOtpEmail(email, otpCode);
    } catch (mailError) {
      console.error('Lỗi khi gửi mail OTP:', mailError);
      throw new AppError(500, 'MAIL_SEND_FAILED', 'Không thể gửi mã OTP tới email của bạn. Vui lòng thử lại sau.');
    }

    // 6. Tạo Token tạm thời (hạn 5 phút) chỉ dành cho bước xác thực OTP
    const tempToken = jwt.sign(
      { userId: String(user._id), email, type: 'google_2fa_pending' },
      env.jwtAccessSecret,
      { expiresIn: '5m' }
    );

    return {
      step: '2FA_OTP_REQUIRED',
      tempToken,
      email,
      message: `Mã OTP xác thực đã được gửi tới địa chỉ email: ${email}`,
    };
  }

  /**
   * Bước 2: Xác minh mã OTP gửi về Gmail và hoàn tất đăng nhập
   */
  public async verifyGoogleOtp(tempToken: string, otpCode: string): Promise<VerifyOtpResponse> {
    // 1. Kiểm tra tính hợp lệ của tempToken
    let decoded: TempTokenPayload;
    try {
      decoded = jwt.verify(tempToken, env.jwtAccessSecret) as TempTokenPayload;
    } catch {
      throw new AppError(401, 'INVALID_TEMP_TOKEN', 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.');
    }

    if (decoded.type !== 'google_2fa_pending') {
      throw new AppError(400, 'INVALID_TOKEN_TYPE', 'Loại token không hợp lệ.');
    }

    // 2. Tìm mã OTP hợp lệ trong database
    const otpRecord = await OtpRequest.findOne({
      identifier: decoded.email,
      otp_code: otpCode,
      purpose: 'google_login_2fa',
      is_used: false,
      expires_at: { $gt: new Date() },
    });

    if (!otpRecord) {
      throw new AppError(400, 'INVALID_OTP', 'Mã OTP không chính xác hoặc đã hết hạn.');
    }

    // 3. Đánh dấu OTP đã sử dụng
    otpRecord.is_used = true;
    await otpRecord.save();

    // 4. Lấy thông tin User
    const user = await User.findById(decoded.userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Không tìm thấy thông tin người dùng.');
    }

    // 5. Cấp Access Token và Refresh Token chính thức
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

    const authenticatedUser: AuthenticatedUser = {
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      avatar: user.avatar,
    };

    return {
      user: authenticatedUser,
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  /**
   * Gửi lại mã OTP nếu chưa nhận được hoặc hết hạn
   */
  public async resendGoogleOtp(tempToken: string): Promise<{ message: string }> {
    let decoded: TempTokenPayload;
    try {
      decoded = jwt.verify(tempToken, env.jwtAccessSecret) as TempTokenPayload;
    } catch {
      throw new AppError(401, 'INVALID_TEMP_TOKEN', 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.');
    }

    const otpCode = Math.floor(100_000 + Math.random() * 900_000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const purgeAt = new Date(Date.now() + 10 * 60 * 1000);

    await OtpRequest.create({
      identifier: decoded.email,
      otp_code: otpCode,
      purpose: 'google_login_2fa',
      is_used: false,
      expires_at: expiresAt,
      purgeAt,
    });

    await sendOtpEmail(decoded.email, otpCode);

    return {
      message: `Đã gửi lại mã OTP mới đến email: ${decoded.email}`,
    };
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
}

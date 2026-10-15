export interface GoogleUserProfile {
  email: string;
  name: string;
  picture?: string | undefined;
  googleId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string | undefined;
  role: string;
  avatar?: string | undefined;
}

export interface GoogleLoginResponse {
  step: '2FA_OTP_REQUIRED';
  tempToken: string;
  email: string;
  message: string;
}

export interface VerifyOtpResponse {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

/** Kết quả đăng nhập Google qua Direct API: Gmail đã đăng ký thì vào thẳng, chưa thì cần OTP */
export type GoogleAuthResult = ({ step: 'AUTHENTICATED' } & VerifyOtpResponse) | GoogleLoginResponse;

/** Kết quả đăng nhập Google qua Web Redirect: Gmail đã đăng ký thì nhận mã đổi dùng một lần */
export type GoogleRedirectResult = { step: 'AUTHENTICATED'; loginCode: string } | GoogleLoginResponse;

export interface RegisterDTO {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}

/** Thông tin đăng ký lưu kèm OTP, chỉ dùng để tạo User sau khi xác minh mã */
export interface PendingRegistration {
  fullName: string;
  phone: string;
  passwordHash: string;
}

export interface RegistrationChallenge {
  email: string;
  /** Số giây phải chờ trước khi được yêu cầu gửi lại mã */
  resendAfterSeconds: number;
  message: string;
}

export interface VerifyRegistrationOtpDTO {
  email: string;
  otpCode: string;
}

/** Đăng ký xong không tự đăng nhập nên không cấp token */
export interface RegisterResponse {
  user: AuthenticatedUser;
}

export interface LoginDTO {
  /** Email hoặc số điện thoại */
  identifier: string;
  password: string;
}

/** Phiên đăng nhập đầy đủ: thông tin user + cặp token */
export interface AuthSessionResponse {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

export type LoginResponse = AuthSessionResponse;

export interface ForgotPasswordResponse {
  email: string;
  /** Số giây phải chờ trước khi được yêu cầu gửi lại mã */
  resendAfterSeconds: number;
  message: string;
}

export interface VerifyResetCodeDTO {
  email: string;
  otpCode: string;
}

export interface VerifyResetCodeResponse {
  resetToken: string;
}

export interface ResetPasswordDTO {
  resetToken: string;
  newPassword: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

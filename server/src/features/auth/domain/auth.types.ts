export interface GoogleUserProfile {
  email: string;
  name: string;
  picture?: string;
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
  phone?: string;
  role: string;
  avatar?: string;
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

export interface RegisterDTO {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}

export interface RegisterResponse {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

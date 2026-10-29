export type OtpEmailPurpose = 'google_login' | 'register';

/** Gửi email cho luồng xác thực; bản thật là integrations/email/mailer.ts */
export interface AuthMailer {
  sendOtpEmail(toEmail: string, otpCode: string, purpose?: OtpEmailPurpose): Promise<void>;
  sendResetPasswordEmail(toEmail: string, otpCode: string, resetLink?: string): Promise<void>;
}

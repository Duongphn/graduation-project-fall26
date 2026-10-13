import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

const transporter = nodemailer.createTransport({
  host: env.emailHost,
  port: env.emailPort,
  secure: env.emailPort === 465, // true nếu 465, false nếu 587
  auth: {
    user: env.emailUser,
    pass: env.emailAppPassword,
  },
});

export const sendOtpEmail = async (toEmail: string, otpCode: string): Promise<void> => {
  const mailOptions = {
    from: `"ToyFlow Platform" <${env.emailUser}>`,
    to: toEmail,
    subject: 'Mã xác minh đăng nhập ToyFlow (OTP)',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0; font-size: 26px;">ToyFlow</h2>
          <p style="color: #64748b; margin-top: 4px; font-size: 14px;">Nền tảng chia sẻ đồ chơi thông minh</p>
        </div>
        
        <p style="color: #1e293b; font-size: 16px;">Xin chào,</p>
        <p style="color: #475569; font-size: 15px; line-height: 1.5;">
          Bạn vừa thực hiện đăng nhập vào hệ thống ToyFlow qua tài khoản Google. Dưới đây là mã xác thực 2 bước (OTP) của bạn:
        </p>
        
        <div style="margin: 28px 0; text-align: center;">
          <div style="display: inline-block; background-color: #f1f5f9; padding: 16px 36px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #312e81; border-radius: 8px; border: 1px dashed #6366f1;">
            ${otpCode}
          </div>
        </div>
        
        <p style="color: #64748b; font-size: 14px; line-height: 1.5;">
          ⏱️ Mã xác thực này có hiệu lực trong vòng <strong>5 phút</strong>.<br/>
          🔒 Tuyệt đối không chia sẻ mã này cho bất kỳ ai để bảo vệ tài khoản của bạn.
        </p>
        
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
          Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export const sendResetPasswordEmail = async (
  toEmail: string,
  otpCode: string,
  resetLink?: string
): Promise<void> => {
  const mailOptions = {
    from: `"ToyFlow Platform" <${env.emailUser}>`,
    to: toEmail,
    subject: 'Yêu cầu đặt lại mật khẩu tài khoản ToyFlow',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #4f46e5; margin: 0; font-size: 26px;">ToyFlow</h2>
          <p style="color: #64748b; margin-top: 4px; font-size: 14px;">Khôi phục quyền truy cập tài khoản</p>
        </div>
        
        <p style="color: #1e293b; font-size: 16px;">Xin chào,</p>
        <p style="color: #475569; font-size: 15px; line-height: 1.5;">
          Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>${toEmail}</strong>. Bạn có thể sử dụng mã OTP dưới đây để hoàn tất việc đặt lại mật khẩu:
        </p>
        
        <div style="margin: 28px 0; text-align: center;">
          <div style="display: inline-block; background-color: #f8fafc; padding: 16px 36px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #dc2626; border-radius: 8px; border: 1px dashed #ef4444;">
            ${otpCode}
          </div>
        </div>

        ${
          resetLink
            ? `
        <div style="text-align: center; margin: 20px 0;">
          <a href="${resetLink}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
            Bấm vào đây để đặt lại mật khẩu trực tiếp
          </a>
        </div>
        `
            : ''
        }
        
        <p style="color: #64748b; font-size: 14px; line-height: 1.5;">
          ⏱️ Mã xác thực này có hiệu lực trong vòng <strong>10 phút</strong>.<br/>
          🔒 Nếu bạn không yêu cầu đặt lại mật khẩu, tài khoản của bạn vẫn an toàn và bạn có thể yên tâm bỏ qua email này.
        </p>
        
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
          Đây là email tự động từ hệ thống ToyFlow. Vui lòng không phản hồi thư này.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

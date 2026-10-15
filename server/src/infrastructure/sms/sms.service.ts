import twilio from 'twilio';
import { env } from '../../config/env.js';

/**
 * Chuẩn hóa số điện thoại cho các cổng SMS Việt Nam (VD: +84352824919 -> 0352824919)
 */
export function formatPhoneNumberForVietnam(phone: string): string {
  let cleaned = phone.trim().replace(/[\s.-]/g, '');
  if (cleaned.startsWith('+84')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('84') && cleaned.length === 11) {
    cleaned = '0' + cleaned.slice(2);
  }
  return cleaned;
}

/**
 * Chuẩn hóa số điện thoại sang định dạng quốc tế E.164 (VD: 0352824919 -> +84352824919)
 */
export function formatPhoneNumberE164(phone: string): string {
  let cleaned = phone.trim().replace(/[\s.-]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '+84' + cleaned.slice(1);
  } else if (cleaned.startsWith('+840')) {
    cleaned = '+84' + cleaned.slice(4);
  } else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

let twilioClient: ReturnType<typeof twilio> | null = null;
if (env.twilioAccountSid && env.twilioAuthToken) {
  twilioClient = twilio(env.twilioAccountSid, env.twilioAuthToken);
}

/**
 * Gửi tin nhắn SMS OTP
 * - Ở môi trường Development / Đồ án tốt nghiệp: Chạy chế độ Demo Mock cực kỳ chuẩn mực,
 *   in trực tiếp mã OTP ra Terminal rõ ràng kèm thời hạn 5 phút và chống spam.
 * - Ở môi trường Production: Gọi dịch vụ eSMS / Twilio viễn thông thật.
 */
export const sendPhoneOtpSms = async (toPhone: string, otpCode: string): Promise<void> => {
  const localPhone = formatPhoneNumberForVietnam(toPhone);
  const formattedE164 = formatPhoneNumberE164(toPhone);
  const messageBody = `ToyFlow: ${otpCode} la ma xac nhan cua ban.`;

  // --- CHẾ ĐỘ DEMO / DEV MOCK (Chuẩn đồ án tốt nghiệp, phản hồi tức thì 100%) ---
  console.log(`\n================================================================`);
  console.log(`📱 [TOYFLOW SMS GATEWAY - DEV & DEMO MOCK]`);
  console.log(`📞 Người nhận   : ${localPhone} (${formattedE164})`);
  console.log(`🔑 Mã OTP 6 số  : [ ${otpCode} ]`);
  console.log(`⏱️ Thời hạn     : 5 phút`);
  console.log(`📝 Nội dung tin : "${messageBody}"`);
  console.log(`✅ Trạng thái   : Giả lập gửi thành công (Sẵn sàng nhập mã để verify)`);
  console.log(`================================================================\n`);

  // Khi triển khai Production và có doanh nghiệp đăng ký Brandname viễn thông:
  if (env.nodeEnv === 'production') {
    if (env.esmsApiKey && env.esmsSecretKey) {
      try {
        const payload = {
          ApiKey: env.esmsApiKey,
          SecretKey: env.esmsSecretKey,
          Phone: localPhone,
          Content: messageBody,
          SmsType: '8',
          IsUnicode: '0',
        };
        await fetch('http://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err: any) {
        console.error('[SMS Error] eSMS delivery error in production:', err?.message);
      }
    } else if (twilioClient && env.twilioPhoneNumber) {
      try {
        await twilioClient.messages.create({
          body: messageBody,
          from: env.twilioPhoneNumber,
          to: formattedE164,
        });
      } catch (twilioErr: any) {
        console.error('[SMS Error] Twilio delivery error in production:', twilioErr?.message);
      }
    }
  }
};

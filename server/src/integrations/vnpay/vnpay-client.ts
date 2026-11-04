import crypto from 'node:crypto';
import type {
  VNPayCreatePaymentInput,
  VNPayPaymentGateway,
} from '../../interfaces/payment.ports.js';

export type { VNPayCreatePaymentInput, VNPayPaymentGateway };

export class VNPayClient implements VNPayPaymentGateway {
  public buildPaymentUrl(input: VNPayCreatePaymentInput): string {
    return VNPayClient.buildPaymentUrl(input);
  }

  public verifySignature(params: Record<string, unknown>, secretKey: string): boolean {
    return VNPayClient.verifySignature(params, secretKey);
  }
  /**
   * Định dạng Date thành yyyyMMddHHmmss theo múi giờ Việt Nam (UTC+7)
   */
  public static formatDate(date: Date = new Date()): string {
    const vnTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const yyyy = vnTime.getUTCFullYear();
    const MM = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(vnTime.getUTCDate()).padStart(2, '0');
    const HH = String(vnTime.getUTCHours()).padStart(2, '0');
    const mm = String(vnTime.getUTCMinutes()).padStart(2, '0');
    const ss = String(vnTime.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
  }

  /**
   * Sắp xếp và encode các query params theo đúng chuẩn VNPay:
   * encodeURIComponent(key) và encodeURIComponent(value).replace(/%20/g, "+")
   */
  public static createVNPaySignature(
    params: Record<string, unknown>,
    secretKey: string,
  ): { signData: string; signature: string } {
    const filteredParams: Record<string, string> = {};

    for (const [key, value] of Object.entries(params)) {
      if (
        key === 'vnp_SecureHash' ||
        key === 'vnp_SecureHashType' ||
        value === undefined ||
        value === null ||
        value === ''
      ) {
        continue;
      }
      filteredParams[key] = String(value);
    }

    const sortedKeys = Object.keys(filteredParams).sort();
    const signParts: string[] = [];

    for (const key of sortedKeys) {
      const val = filteredParams[key];
      if (val !== undefined) {
        const encodedKey = encodeURIComponent(key);
        const encodedValue = encodeURIComponent(val).replace(/%20/g, '+');
        signParts.push(`${encodedKey}=${encodedValue}`);
      }
    }

    const signData = signParts.join('&');
    const signature = crypto
      .createHmac('sha512', secretKey)
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');

    return { signData, signature };
  }

  /**
   * Kiểm tra tính hợp lệ của chữ ký HMAC-SHA512 từ VNPay gửi về (Return URL hoặc IPN Webhook)
   */
  public static verifySignature(params: Record<string, unknown>, secretKey: string): boolean {
    const receivedHash = params['vnp_SecureHash'];
    if (!receivedHash || typeof receivedHash !== 'string') {
      return false;
    }

    const { signature } = this.createVNPaySignature(params, secretKey);
    return receivedHash.toLowerCase() === signature.toLowerCase();
  }

  /**
   * Tạo URL thanh toán VNPay chuyển hướng người dùng
   */
  public static buildPaymentUrl(input: VNPayCreatePaymentInput): string {
    const createDate = input.createDate ?? new Date();
    const vnpParams: Record<string, string | number> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: input.tmnCode,
      vnp_Locale: input.locale ?? 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: 'other',
      vnp_Amount: Math.round(input.amount * 100), // VNPay yêu cầu nhân 100
      vnp_ReturnUrl: input.returnUrl,
      vnp_IpAddr: input.clientIp || '127.0.0.1',
      vnp_CreateDate: this.formatDate(createDate),
    };

    if (input.bankCode && input.bankCode.trim()) {
      vnpParams.vnp_BankCode = input.bankCode.trim();
    }

    const { signData, signature } = this.createVNPaySignature(vnpParams, input.hashSecret);
    return `${input.paymentUrl}?${signData}&vnp_SecureHash=${signature}`;
  }
}

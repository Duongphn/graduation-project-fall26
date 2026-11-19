import crypto from 'node:crypto';
import type { VNPayCreatePaymentInput, VNPayPaymentGateway } from '../../interfaces/payment.ports.js';

/**
 * VNPay payment gateway, API 2.1.0 (sandbox: https://sandbox.vnpayment.vn).
 * Signature: sort the vnp_* parameters by name, encode key and value with encodeURIComponent
 * (spaces as "+"), join with "&", then HMAC-SHA512 with the hash secret (hex).
 */
export class VNPayClient implements VNPayPaymentGateway {
  public buildPaymentUrl(input: VNPayCreatePaymentInput): string {
    return VNPayClient.buildPaymentUrl(input);
  }

  public verifySignature(params: Record<string, unknown>, secretKey: string): boolean {
    return VNPayClient.verifySignature(params, secretKey);
  }

  /** yyyyMMddHHmmss in Vietnam time (GMT+7), the format of vnp_CreateDate / vnp_ExpireDate */
  public static formatDate(date: Date): string {
    const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    return (
      `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1)}${pad(vn.getUTCDate())}` +
      `${pad(vn.getUTCHours())}${pad(vn.getUTCMinutes())}${pad(vn.getUTCSeconds())}`
    );
  }

  /** The signed query string and its HMAC-SHA512 (vnp_SecureHash and empty values left out) */
  public static createSignature(
    params: Record<string, unknown>,
    secretKey: string,
  ): { signData: string; signature: string } {
    const signData = Object.entries(params)
      .filter(
        ([key, value]) =>
          key !== 'vnp_SecureHash' &&
          key !== 'vnp_SecureHashType' &&
          value !== undefined &&
          value !== null &&
          value !== '',
      )
      .map(([key, value]) => [key, String(value)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(/%20/g, '+')}`)
      .join('&');

    const signature = crypto.createHmac('sha512', secretKey).update(Buffer.from(signData, 'utf-8')).digest('hex');
    return { signData, signature };
  }

  /** Checks vnp_SecureHash of a Return URL or IPN query (constant-time comparison) */
  public static verifySignature(params: Record<string, unknown>, secretKey: string): boolean {
    const received = params.vnp_SecureHash;
    if (typeof received !== 'string' || !/^[0-9a-f]{128}$/i.test(received)) return false;

    const { signature } = this.createSignature(params, secretKey);
    return crypto.timingSafeEqual(Buffer.from(received.toLowerCase(), 'hex'), Buffer.from(signature, 'hex'));
  }

  /** The VNPay URL the browser is sent to */
  public static buildPaymentUrl(input: VNPayCreatePaymentInput): string {
    const params: Record<string, string | number> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: input.tmnCode,
      vnp_Locale: input.locale ?? 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: 'other',
      // VNPay amounts are in VND × 100
      vnp_Amount: Math.round(input.amount * 100),
      vnp_ReturnUrl: input.returnUrl,
      vnp_IpAddr: input.clientIp || '127.0.0.1',
      vnp_CreateDate: this.formatDate(input.createDate),
      vnp_ExpireDate: this.formatDate(input.expireDate),
    };
    if (input.bankCode?.trim()) params.vnp_BankCode = input.bankCode.trim();

    const { signData, signature } = this.createSignature(params, input.hashSecret);
    return `${input.paymentUrl}?${signData}&vnp_SecureHash=${signature}`;
  }
}

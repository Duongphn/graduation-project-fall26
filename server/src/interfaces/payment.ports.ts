export interface VNPayCreatePaymentInput {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  returnUrl: string;
  /** VND, integer */
  amount: number;
  txnRef: string;
  /** Vietnamese without accents, no special characters */
  orderInfo: string;
  clientIp: string;
  createDate: Date;
  expireDate: Date;
  bankCode?: string | undefined;
  locale?: 'vn' | 'en' | undefined;
}

/** VNPay payment link and checksum (integrations/vnpay/vnpay-client.ts) */
export interface VNPayPaymentGateway {
  buildPaymentUrl(input: VNPayCreatePaymentInput): string;
  /** true when vnp_SecureHash matches the other vnp_* parameters */
  verifySignature(params: Record<string, unknown>, secretKey: string): boolean;
}

/** VNPay settings of the payment service (env.vnpay*; tests pass their own). */
export interface VNPayConfig {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  returnUrl: string;
}

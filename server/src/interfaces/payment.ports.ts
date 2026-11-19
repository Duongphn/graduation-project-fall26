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

/** PayOS link status (GET /v2/payment-requests/{orderCode}) */
export type PayOSLinkStatus = 'PENDING' | 'CANCELLED' | 'UNDERPAID' | 'PAID' | 'EXPIRED' | 'PROCESSING' | 'FAILED';

export interface PayOSCreateLinkInput {
  /** Positive integer, unique per payment */
  orderCode: number;
  amount: number;
  /** At most 25 characters, no accents */
  description: string;
  returnUrl: string;
  cancelUrl: string;
  /** Unix seconds */
  expiredAt: number;
}

export interface PayOSLink {
  checkoutUrl: string;
  /** VietQR content any banking app can scan */
  qrCode: string;
  paymentLinkId: string;
}

export interface PayOSLinkState {
  status: PayOSLinkStatus;
  amount: number;
  amountPaid: number;
  /** Bank reference of the transfer, when paid */
  reference?: string | undefined;
}

/** Data of a webhook whose signature checked out */
export interface PayOSWebhookData {
  orderCode: number;
  amount: number;
  /** '00' = paid */
  code: string;
  reference: string;
}

/** PayOS payment links and webhook signature (integrations/payos/payos-client.ts) */
export interface PayOSGateway {
  createPaymentLink(input: PayOSCreateLinkInput): Promise<PayOSLink>;
  getPaymentLink(orderCode: number): Promise<PayOSLinkState>;
  /** Throws when the signature does not match */
  verifyWebhook(body: unknown): Promise<PayOSWebhookData>;
}

export interface PayOSConfig {
  clientId: string;
  apiKey: string;
  checksumKey: string;
  returnUrl: string;
}

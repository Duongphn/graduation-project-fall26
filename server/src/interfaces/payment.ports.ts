export interface VNPayCreatePaymentInput {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  returnUrl: string;
  amount: number;
  txnRef: string;
  orderInfo: string;
  clientIp: string;
  bankCode?: string | undefined;
  locale?: 'vn' | 'en' | undefined;
  createDate?: Date | undefined;
}

export interface VNPayPaymentGateway {
  buildPaymentUrl(input: VNPayCreatePaymentInput): string;
  verifySignature(params: Record<string, unknown>, secretKey: string): boolean;
}


import { PayOS, type Webhook } from '@payos/node';
import type {
  PayOSCreateLinkInput,
  PayOSGateway,
  PayOSLink,
  PayOSLinkState,
  PayOSWebhookData,
} from '../../interfaces/payment.ports.js';

interface PayOSCredentials {
  clientId: string;
  apiKey: string;
  checksumKey: string;
}

/**
 * PayOS (https://payos.vn) through its official SDK: bank transfer by VietQR, real money into the
 * bank account linked to the PayOS channel. The SDK signs requests and checks webhook signatures
 * with the checksum key. Created lazily so a server without PayOS keys still starts.
 */
export class PayOSClient implements PayOSGateway {
  private sdk: PayOS | undefined;

  public constructor(private readonly credentials: PayOSCredentials) {}

  private client(): PayOS {
    this.sdk ??= new PayOS({
      clientId: this.credentials.clientId,
      apiKey: this.credentials.apiKey,
      checksumKey: this.credentials.checksumKey,
      // No SDK retries: a failed call is reported to the user at once
      maxRetries: 0,
    });
    return this.sdk;
  }

  public async createPaymentLink(input: PayOSCreateLinkInput): Promise<PayOSLink> {
    const link = await this.client().paymentRequests.create({
      orderCode: input.orderCode,
      amount: input.amount,
      description: input.description,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
      expiredAt: input.expiredAt,
    });
    return {
      checkoutUrl: link.checkoutUrl,
      qrCode: link.qrCode,
      paymentLinkId: link.paymentLinkId,
      bin: link.bin,
      accountNumber: link.accountNumber,
      accountName: link.accountName,
      description: link.description,
    };
  }

  public async getPaymentLink(orderCode: number): Promise<PayOSLinkState> {
    const link = await this.client().paymentRequests.get(orderCode);
    return {
      status: link.status,
      amount: link.amount,
      amountPaid: link.amountPaid,
      reference: link.transactions[0]?.reference,
    };
  }

  public async cancelPaymentLink(orderCode: number, reason: string): Promise<void> {
    await this.client().paymentRequests.cancel(orderCode, reason);
  }

  public async verifyWebhook(body: unknown): Promise<PayOSWebhookData> {
    const data = await this.client().webhooks.verify(body as Webhook);
    return { orderCode: data.orderCode, amount: data.amount, code: data.code, reference: data.reference };
  }
}

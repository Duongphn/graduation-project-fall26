import { randomInt } from 'node:crypto';
import { TOPUP_EXPIRY_GRACE_MINUTES, TOPUP_LINK_MINUTES } from '../constants/wallet-transaction.js';
import type { PayOSConfig, PayOSGateway, PayOSLinkState } from '../interfaces/payment.ports.js';
import type { WalletLedgerPort } from '../interfaces/wallet.ports.js';
import type { PaymentRecord, PaymentRepository } from '../repositories/payment.repository.js';
import type { RequestActor } from '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';
import { toReturnResult, TopupSettlement, type TopupReturnResult } from './topup-settlement.js';

const MINUTE = 60_000;

/** PayOS statuses after which the link cannot be paid any more */
const CLOSED_STATUSES = new Set<PayOSLinkState['status']>(['CANCELLED', 'EXPIRED', 'FAILED']);

/** Transfer details for ToyFlow's own QR page (POST /payments/topup/payos, GET /payments/payos/:code) */
export interface PayosCheckoutDto {
  paymentCode: string;
  amount: number;
  /** pending | success | failed | cancelled */
  status: TopupReturnResult['status'];
  expiresAt: string;
  /** VietQR content any banking app can scan */
  qrCode: string;
  /** PayOS's own checkout page, as a fallback */
  checkoutUrl: string;
  /** NAPAS BIN of the receiving bank (970422 = MB…) */
  bankBin: string;
  accountNumber: string;
  accountName: string;
  /** Transfer note to type when not scanning */
  description: string;
}

/** Kept for callers of the creation endpoint */
export type PayosTopupResult = PayosCheckoutDto;

const toCheckoutDto = (payment: PaymentRecord): PayosCheckoutDto | null => {
  const checkout = payment.checkout;
  if (!checkout?.qrCode || !payment.expiresAt) return null;
  return {
    paymentCode: payment.code,
    amount: payment.amount,
    status: toReturnResult(payment).status,
    expiresAt: payment.expiresAt.toISOString(),
    qrCode: checkout.qrCode,
    checkoutUrl: checkout.checkoutUrl,
    bankBin: checkout.bin,
    accountNumber: checkout.accountNumber,
    accountName: checkout.accountName,
    description: checkout.description,
  };
};

const notFound = (): TopupReturnResult => ({
  success: false,
  status: 'not_found',
  message: 'Không tìm thấy giao dịch nạp tiền.',
});

/**
 * UC17 top-up by bank transfer through PayOS (VietQR, real money). The payment starts pending;
 * the PayOS webhook (signature checked by the SDK) or the return page (which asks PayOS for the
 * link status, so it also works where PayOS cannot reach the server) settles it through
 * TopupSettlement: the wallet is credited once. Cancelled, expired or failed links become 'failed'.
 */
export class PayosTopupService {
  private readonly settlement: TopupSettlement;

  public constructor(
    private readonly payments: PaymentRepository,
    private readonly ledger: WalletLedgerPort,
    private readonly gateway: PayOSGateway,
    private readonly config: PayOSConfig,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.settlement = new TopupSettlement(payments, ledger);
  }

  public async createTopup(actor: RequestActor, amount: number): Promise<PayosTopupResult> {
    if (!this.config.clientId || !this.config.apiKey || !this.config.checksumKey) {
      throw new AppError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED', 'Cổng PayOS chưa được cấu hình. Vui lòng thử lại sau.');
    }

    const wallet = await this.ledger.getOrCreateUserWallet(actor.userId);
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + TOPUP_LINK_MINUTES * MINUTE);
    // PayOS needs a positive integer: seconds + 3 random digits (13 digits, a safe integer)
    const orderCode = Number(`${Math.floor(createdAt.getTime() / 1000)}${randomInt(100, 1000)}`);
    const code = String(orderCode);

    await this.payments.createTopup({ code, gateway: 'payos', userId: actor.userId, walletId: wallet.id, amount, expiresAt });

    let link;
    try {
      link = await this.gateway.createPaymentLink({
        orderCode,
        amount,
        // Shown in the transfer note: at most 25 characters, no accents
        description: `NAP VI ${code}`,
        returnUrl: this.config.returnUrl,
        cancelUrl: this.config.returnUrl,
        expiredAt: Math.floor(expiresAt.getTime() / 1000),
      });
    } catch (error) {
      await this.payments.claimPending(code, { status: 'failed', gatewayResponseCode: 'link_error' });
      console.error('[payos] create payment link failed', error);
      throw new AppError(502, 'PAYOS_GATEWAY_ERROR', 'Không tạo được mã thanh toán PayOS. Vui lòng thử lại sau.');
    }
    const checkout = {
      qrCode: link.qrCode,
      checkoutUrl: link.checkoutUrl,
      bin: link.bin,
      accountNumber: link.accountNumber,
      accountName: link.accountName,
      description: link.description,
    };
    await this.payments.saveCheckout(code, link.paymentLinkId, checkout);

    return {
      paymentCode: code,
      amount,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
      qrCode: checkout.qrCode,
      checkoutUrl: checkout.checkoutUrl,
      bankBin: checkout.bin,
      accountNumber: checkout.accountNumber,
      accountName: checkout.accountName,
      description: checkout.description,
    };
  }

  /** GET /payments/payos/:code — the QR page of the owner's PayOS top-up */
  public async getCheckout(actor: RequestActor, code: string): Promise<PayosCheckoutDto> {
    const payment = await this.payments.findByCode(code);
    const dto = payment && payment.gateway === 'payos' && payment.userId.toString() === actor.userId ? toCheckoutDto(payment) : null;
    if (!dto) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch nạp tiền.');
    return dto;
  }

  /**
   * POST /payments/payos/:code/cancel — the user gives up on the QR. The PayOS link is cancelled
   * first; if PayOS refuses (e.g. it was paid meanwhile) the real status is checked instead, so a
   * paid transfer is still credited.
   */
  public async cancel(actor: RequestActor, code: string): Promise<TopupReturnResult> {
    const payment = await this.payments.findByCode(code);
    if (!payment || payment.gateway !== 'payos' || payment.userId.toString() !== actor.userId) return notFound();
    if (payment.status !== 'pending') return toReturnResult(payment);

    try {
      await this.gateway.cancelPaymentLink(Number(code), 'Người dùng huỷ nạp tiền trên ToyFlow');
    } catch (error) {
      console.error(`[payos] cancel ${code} failed`, error);
      return this.confirmReturn(actor, code);
    }
    return this.settled(payment, await this.settlement.fail(payment, 'CANCELLED'));
  }

  /**
   * GET /payments/payos-return?orderCode=: PayOS sends the browser back after paying or
   * cancelling. Asks PayOS for the link status and settles a pending payment.
   */
  public async confirmReturn(actor: RequestActor, orderCode: string): Promise<TopupReturnResult> {
    const payment = await this.payments.findByCode(orderCode);
    if (!payment || payment.gateway !== 'payos' || payment.userId.toString() !== actor.userId) return notFound();
    if (payment.status !== 'pending') return toReturnResult(payment);

    let link: PayOSLinkState;
    try {
      link = await this.gateway.getPaymentLink(Number(orderCode));
    } catch (error) {
      console.error('[payos] get payment link failed', error);
      return {
        ...toReturnResult(payment),
        message: 'Chưa kiểm tra được với PayOS. Vui lòng bấm "Kiểm tra lại" sau ít giây.',
      };
    }

    if (link.status === 'PAID' && link.amountPaid >= payment.amount) {
      return this.settled(payment, await this.settlement.credit(payment, { gatewayResponseCode: '00', gatewayTransactionNo: link.reference }));
    }
    if (CLOSED_STATUSES.has(link.status)) {
      return this.settled(payment, await this.settlement.fail(payment, link.status));
    }
    // PENDING / PROCESSING / UNDERPAID: the transfer has not fully arrived yet
    return toReturnResult(payment);
  }

  /**
   * POST /payments/payos-webhook: PayOS posts each paid transfer. Throws 400 when the signature
   * is wrong; otherwise always answers OK (PayOS retries on errors), crediting only a pending
   * PayOS payment whose amount matches.
   */
  public async handleWebhook(body: unknown): Promise<{ received: true }> {
    let data;
    try {
      data = await this.gateway.verifyWebhook(body);
    } catch {
      throw new AppError(400, 'INVALID_WEBHOOK_SIGNATURE', 'Chữ ký webhook PayOS không hợp lệ.');
    }

    if (data.code !== '00') return { received: true };
    const payment = await this.payments.findByCode(String(data.orderCode));
    // PayOS also sends a test webhook (orderCode 123) when the URL is confirmed
    if (!payment || payment.gateway !== 'payos' || payment.status !== 'pending') return { received: true };
    if (data.amount !== payment.amount) {
      console.warn(`[payos] webhook amount ${data.amount} does not match payment ${payment.code} (${payment.amount})`);
      return { received: true };
    }

    await this.settlement.credit(payment, { gatewayResponseCode: '00', gatewayTransactionNo: data.reference || undefined });
    return { received: true };
  }

  /**
   * Expiry job: PayOS top-ups still pending after their link expired. Real money may have arrived
   * without a webhook (the user closed the page, PayOS could not reach the server), so PayOS is
   * asked first: paid → credited, otherwise → failed. A PayOS error leaves it for the next run.
   */
  public async reconcileExpired(): Promise<{ credited: number; expired: number }> {
    const before = new Date(this.now().getTime() - TOPUP_EXPIRY_GRACE_MINUTES * MINUTE);
    const stale = await this.payments.listExpiredPending('payos', before);
    let credited = 0;
    let expired = 0;

    for (const payment of stale) {
      let link: PayOSLinkState;
      try {
        link = await this.gateway.getPaymentLink(Number(payment.code));
      } catch (error) {
        console.error(`[payos] reconcile ${payment.code} failed`, error);
        continue;
      }
      if (link.status === 'PAID' && link.amountPaid >= payment.amount) {
        if (await this.settlement.credit(payment, { gatewayResponseCode: '00', gatewayTransactionNo: link.reference })) {
          credited += 1;
        }
      } else if (link.status !== 'PROCESSING' && (await this.settlement.fail(payment, CLOSED_STATUSES.has(link.status) ? link.status : 'expired'))) {
        expired += 1;
      }
    }
    return { credited, expired };
  }

  private async settled(payment: PaymentRecord, result: PaymentRecord | null): Promise<TopupReturnResult> {
    return toReturnResult(result ?? (await this.settlement.current(payment)));
  }
}

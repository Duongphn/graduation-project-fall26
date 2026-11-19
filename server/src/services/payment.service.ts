import { randomInt } from 'node:crypto';
import {
  TOPUP_EXPIRY_GRACE_MINUTES,
  TOPUP_LINK_MINUTES,
} from '../constants/wallet-transaction.js';
import type { VNPayConfig, VNPayPaymentGateway } from '../interfaces/payment.ports.js';
import type { WalletLedgerPort } from '../interfaces/wallet.ports.js';
import type { PaymentRecord, PaymentRepository } from '../repositories/payment.repository.js';
import type { RequestActor } from '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';
import {
  isCancelledPayment,
  toReturnResult,
  TopupSettlement,
  type TopupReturnResult,
} from './topup-settlement.js';

export type { TopupReturnResult, TopupReturnStatus } from './topup-settlement.js';

const MINUTE = 60_000;

export interface TopupInput {
  amount: number;
  bankCode?: string | undefined;
}

/** POST /payments/topup/vnpay (same fields as the lead's API) */
export interface TopupResult {
  paymentUrl: string;
  paymentCode: string;
  amount: number;
}

/** Answer VNPay expects from the IPN URL */
export interface IpnResult {
  RspCode: string;
  Message: string;
}

export interface PaymentStatusDto {
  code: string;
  amount: number;
  status: PaymentRecord['status'];
  cancelled: boolean;
  gateway: string;
  createdAt: string;
  expiresAt: string | null;
}

type Settlement =
  | { kind: 'invalid_checksum' }
  | { kind: 'not_found' }
  | { kind: 'amount_mismatch'; payment: PaymentRecord }
  /** This call moved the payment out of pending (and credited the wallet on success) */
  | { kind: 'settled'; payment: PaymentRecord }
  /** Another call (IPN, Return URL or the expiry job) settled it before */
  | { kind: 'already'; payment: PaymentRecord };

/**
 * UC17 Top up wallet via VNPay sandbox. A top-up starts as a pending payment; the IPN
 * (server-to-server) or the Return URL (browser) settles it: checksum, amount, then
 * TopupSettlement (pending → success and the ledger posting in one transaction, once).
 * Failed or cancelled payments become 'failed' (vnp_ResponseCode kept in gatewayResponseCode).
 */
export class PaymentService {
  private readonly settlement: TopupSettlement;

  public constructor(
    private readonly payments: PaymentRepository,
    private readonly ledger: WalletLedgerPort,
    private readonly gateway: VNPayPaymentGateway,
    private readonly config: VNPayConfig,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.settlement = new TopupSettlement(payments, ledger);
  }

  public async createTopupPayment(actor: RequestActor, input: TopupInput, clientIp: string): Promise<TopupResult> {
    if (!this.config.tmnCode || !this.config.hashSecret) {
      throw new AppError(503, 'PAYMENT_GATEWAY_NOT_CONFIGURED', 'Cổng VNPay chưa được cấu hình. Vui lòng thử lại sau.');
    }

    const wallet = await this.ledger.getOrCreateUserWallet(actor.userId);
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + TOPUP_LINK_MINUTES * MINUTE);
    // Letters and digits only (vnp_TxnRef), unique per payment
    const code = `TOPUP${createdAt.getTime()}${randomInt(1000, 10_000)}`;

    await this.payments.createTopup({
      code,
      gateway: 'vnpay',
      userId: actor.userId,
      walletId: wallet.id,
      amount: input.amount,
      expiresAt,
    });

    const paymentUrl = this.gateway.buildPaymentUrl({
      tmnCode: this.config.tmnCode,
      hashSecret: this.config.hashSecret,
      paymentUrl: this.config.paymentUrl,
      returnUrl: this.config.returnUrl,
      amount: input.amount,
      txnRef: code,
      orderInfo: `Nap tien vi ToyFlow ${code}`,
      clientIp,
      createDate: createdAt,
      expireDate: expiresAt,
      bankCode: input.bankCode,
    });

    return { paymentUrl, paymentCode: code, amount: input.amount };
  }

  /** GET /payments/vnpay-ipn: VNPay calls it server-to-server and expects RspCode/Message */
  public async processIpn(query: Record<string, unknown>): Promise<IpnResult> {
    const result = await this.settle(query);
    switch (result.kind) {
      case 'invalid_checksum':
        return { RspCode: '97', Message: 'Invalid Checksum' };
      case 'not_found':
        return { RspCode: '01', Message: 'Order not found' };
      case 'amount_mismatch':
        return { RspCode: '04', Message: 'Invalid amount' };
      case 'already':
        return { RspCode: '02', Message: 'Order already confirmed' };
      case 'settled':
        return { RspCode: '00', Message: 'Confirm Success' };
    }
  }

  /**
   * GET /payments/vnpay-return: the frontend result page forwards the query VNPay redirected
   * with. Settles the payment when the IPN has not (e.g. a local server VNPay cannot reach).
   */
  public async processReturn(query: Record<string, unknown>): Promise<TopupReturnResult> {
    const result = await this.settle(query);
    switch (result.kind) {
      case 'invalid_checksum':
        return { success: false, status: 'invalid_checksum', message: 'Chữ ký xác thực không hợp lệ.' };
      case 'not_found':
        return { success: false, status: 'not_found', message: 'Không tìm thấy giao dịch nạp tiền.' };
      case 'amount_mismatch':
        return {
          success: false,
          status: 'failed',
          paymentCode: result.payment.code,
          amount: result.payment.amount,
          message: 'Số tiền giao dịch không khớp.',
        };
      default:
        return toReturnResult(result.payment);
    }
  }

  /** GET /payments/:code/status — only the owner of the payment (VNPay or PayOS) */
  public async getPaymentStatus(actor: RequestActor, code: string): Promise<PaymentStatusDto> {
    const payment = await this.payments.findByCode(code);
    if (!payment || payment.userId.toString() !== actor.userId) {
      throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy giao dịch.');
    }
    return {
      code: payment.code,
      amount: payment.amount,
      status: payment.status,
      cancelled: isCancelledPayment(payment),
      gateway: payment.gateway,
      createdAt: payment.createdAt.toISOString(),
      expiresAt: payment.expiresAt ? payment.expiresAt.toISOString() : null,
    };
  }

  /** Expiry job: VNPay top-ups still pending well after their link expired become failed */
  public async expireStalePayments(): Promise<{ expired: number }> {
    const before = new Date(this.now().getTime() - TOPUP_EXPIRY_GRACE_MINUTES * MINUTE);
    return { expired: await this.payments.failExpired('vnpay', before) };
  }

  private async settle(query: Record<string, unknown>): Promise<Settlement> {
    if (!this.config.hashSecret || !this.gateway.verifySignature(query, this.config.hashSecret)) {
      return { kind: 'invalid_checksum' };
    }

    const code = typeof query.vnp_TxnRef === 'string' ? query.vnp_TxnRef : '';
    const payment = code ? await this.payments.findByCode(code) : null;
    if (!payment || payment.gateway !== 'vnpay') return { kind: 'not_found' };

    if (Math.round(Number(query.vnp_Amount) / 100) !== payment.amount) {
      return { kind: 'amount_mismatch', payment };
    }
    if (payment.status !== 'pending') return { kind: 'already', payment };

    const responseCode = typeof query.vnp_ResponseCode === 'string' ? query.vnp_ResponseCode : '';
    const paid = responseCode === '00' && query.vnp_TransactionStatus === '00';
    const transactionNo = typeof query.vnp_TransactionNo === 'string' ? query.vnp_TransactionNo : '';

    const settled = paid
      ? await this.settlement.credit(payment, {
          gatewayResponseCode: responseCode,
          // '0' is what VNPay sends when there is no bank transaction
          gatewayTransactionNo: transactionNo && transactionNo !== '0' ? transactionNo : undefined,
        })
      : await this.settlement.fail(payment, responseCode || 'unknown');

    return settled
      ? { kind: 'settled', payment: settled }
      : { kind: 'already', payment: await this.settlement.current(payment) };
  }
}

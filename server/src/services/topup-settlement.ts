import type { WalletLedgerPort } from '../interfaces/wallet.ports.js';
import type { PaymentRecord, PaymentRepository } from '../repositories/payment.repository.js';
import { withTransaction } from '../repositories/transaction.js';

/** gatewayResponseCode of a payment the user cancelled: VNPay '24', PayOS 'CANCELLED' */
const CANCELLED_CODES = new Set(['24', 'CANCELLED']);

export type TopupReturnStatus =
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'pending'
  | 'invalid_checksum'
  | 'not_found';

/** Result page answer (same fields as the lead's GET /payments/vnpay-return) */
export interface TopupReturnResult {
  success: boolean;
  status: TopupReturnStatus;
  paymentCode?: string | undefined;
  amount?: number | undefined;
  message: string;
}

export const isCancelledPayment = (payment: PaymentRecord) =>
  payment.status === 'failed' && CANCELLED_CODES.has(payment.gatewayResponseCode ?? '');

/** What the result page shows for a payment (any gateway) */
export function toReturnResult(payment: PaymentRecord): TopupReturnResult {
  const base = { paymentCode: payment.code, amount: payment.amount };
  if (payment.status === 'success') {
    return { ...base, success: true, status: 'success', message: 'Nạp tiền vào ví thành công.' };
  }
  if (payment.status === 'pending') {
    return { ...base, success: false, status: 'pending', message: 'Đang chờ xác nhận thanh toán.' };
  }
  if (isCancelledPayment(payment)) {
    return { ...base, success: false, status: 'cancelled', message: 'Giao dịch nạp tiền đã bị hủy bởi người dùng.' };
  }
  return {
    ...base,
    success: false,
    status: 'failed',
    message:
      payment.gatewayResponseCode === 'expired' ? 'Giao dịch nạp tiền đã hết hạn.' : 'Giao dịch nạp tiền thất bại.',
  };
}

/**
 * Settles a pending top-up, whatever the gateway. The repository moves it out of 'pending' with a
 * conditional update, so only one caller wins; on success the same MongoDB transaction posts
 * external −amount / user +amount (reference.kind 'payment'). The wallet is credited once even
 * when the webhook/IPN and the return page arrive together.
 */
export class TopupSettlement {
  public constructor(
    private readonly payments: PaymentRepository,
    private readonly ledger: WalletLedgerPort,
  ) {}

  /** Credits the wallet; null when the payment was already settled by another call */
  public async credit(
    payment: PaymentRecord,
    result: { gatewayResponseCode: string; gatewayTransactionNo?: string | undefined },
  ): Promise<PaymentRecord | null> {
    // Wallets are created before the transaction: a duplicate-key upsert inside it would abort it
    const [userWallet, externalWallet] = await Promise.all([
      this.ledger.getOrCreateUserWallet(payment.userId.toString()),
      this.ledger.getOrCreateSystemWallet('external'),
    ]);

    return withTransaction(async (session) => {
      const claimed = await this.payments.claimPending(
        payment.code,
        {
          status: 'success',
          gatewayResponseCode: result.gatewayResponseCode,
          ...(result.gatewayTransactionNo ? { gatewayTransactionNo: result.gatewayTransactionNo } : {}),
        },
        session,
      );
      if (!claimed) return null;

      const gatewayName = payment.gateway === 'payos' ? 'PayOS' : 'VNPay';
      await this.ledger.post(
        `topup:${payment.code}`,
        { kind: 'payment', id: payment._id.toString() },
        [
          { walletId: externalWallet.id, amount: -payment.amount },
          { walletId: userWallet.id, amount: payment.amount },
        ],
        session,
        `Nạp tiền ví qua ${gatewayName} (${payment.code})`,
      );
      return claimed;
    });
  }

  /** Marks it failed (cancelled, declined, expired); null when it was already settled */
  public fail(payment: PaymentRecord, gatewayResponseCode: string): Promise<PaymentRecord | null> {
    return this.payments.claimPending(payment.code, { status: 'failed', gatewayResponseCode });
  }

  /** The payment as stored now (after another call settled it) */
  public async current(payment: PaymentRecord): Promise<PaymentRecord> {
    return (await this.payments.findByCode(payment.code)) ?? payment;
  }
}

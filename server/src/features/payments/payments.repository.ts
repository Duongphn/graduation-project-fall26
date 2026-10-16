import { withTransaction } from '../../infrastructure/database/schema-types.js';
import type { PostLedger } from '../../shared/contracts/ledger.js';
import type { PaymentGateway } from '../../shared/domain/enums.js';
import { PaymentModel } from './payments.model.js';

export interface TopUpCallback {
  gateway: PaymentGateway;
  code: string;
  gatewayTransactionNo: string;
  gatewayResponseCode?: string;
  amount: number;
}

/**
 * Handles a successful gateway callback (GB-16). Only the first callback moves the payment
 * from PENDING to SUCCEEDED and credits the wallet; a repeated callback changes nothing and
 * returns `credited: false`.
 */
export const confirmTopUp = (
  callback: TopUpCallback,
  postLedger: PostLedger,
): Promise<{ credited: boolean }> =>
  withTransaction(async (session) => {
    const payment = await PaymentModel.findOneAndUpdate(
      {
        gateway: callback.gateway,
        code: callback.code,
        amount: callback.amount,
        status: 'PENDING',
      },
      {
        $set: {
          status: 'SUCCEEDED',
          gatewayTransactionNo: callback.gatewayTransactionNo,
          gatewayResponseCode: callback.gatewayResponseCode,
          paidAt: new Date(),
        },
      },
      { new: true, session },
    );
    if (!payment) {
      return { credited: false };
    }

    await postLedger(session, `TOP_UP:${payment._id.toString()}`, [
      {
        walletId: payment.walletId,
        bucket: 'AVAILABLE',
        amount: payment.amount,
        type: 'TOP_UP',
        reference: { kind: 'PAYMENT', id: payment._id },
      },
    ]);
    return { credited: true };
  });

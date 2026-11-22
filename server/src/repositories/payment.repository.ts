import { type ClientSession, type Model, Types } from 'mongoose';
import { Payment } from '../models/index.js';

export type PaymentStatus = 'pending' | 'success' | 'failed';

/** PayOS transfer details of a payment (for ToyFlow's QR page) */
export interface PaymentCheckout {
  qrCode: string;
  checkoutUrl: string;
  bin: string;
  accountNumber: string;
  accountName: string;
  description: string;
}

export interface PaymentRecord {
  _id: Types.ObjectId;
  code: string;
  userId: Types.ObjectId;
  orderType: string;
  /** For a wallet top-up: the user's wallet */
  orderId: Types.ObjectId;
  amount: number;
  gateway: string;
  gatewayTransactionNo?: string;
  gatewayResponseCode?: string;
  gatewayLinkId?: string;
  checkout?: PaymentCheckout;
  status: PaymentStatus;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** The model file has no document type; this is the shape the repository reads and writes */
const PaymentModel = Payment as unknown as Model<PaymentRecord>;

export interface NewTopupPayment {
  code: string;
  gateway: 'vnpay' | 'payos';
  userId: string;
  walletId: string;
  amount: number;
  expiresAt: Date;
}

/** payments collection, used by the VNPay top-up (UC17) */
export class PaymentRepository {
  public async createTopup(input: NewTopupPayment): Promise<PaymentRecord> {
    const doc = await PaymentModel.create({
      code: input.code,
      userId: new Types.ObjectId(input.userId),
      orderType: 'wallet_topup',
      orderId: new Types.ObjectId(input.walletId),
      amount: input.amount,
      gateway: input.gateway,
      status: 'pending',
      expiresAt: input.expiresAt,
    });
    return doc.toObject() as PaymentRecord;
  }

  public async findByCode(code: string, session?: ClientSession): Promise<PaymentRecord | null> {
    return (await PaymentModel.findOne({ code }).session(session ?? null).lean()) as PaymentRecord | null;
  }

  /**
   * Moves a pending payment to its final status. Only one caller can win (the filter requires
   * status 'pending'), so the IPN and the Return URL arriving together settle it once.
   * Returns the updated payment, or null when it was not pending any more.
   */
  public async claimPending(
    code: string,
    update: { status: 'success' | 'failed'; gatewayResponseCode: string; gatewayTransactionNo?: string },
    session?: ClientSession,
  ): Promise<PaymentRecord | null> {
    return (await PaymentModel.findOneAndUpdate(
      { code, status: 'pending' },
      { $set: update },
      { new: true, session: session ?? null },
    ).lean()) as PaymentRecord | null;
  }

  /** Records the PayOS link id and transfer details on the pending payment */
  public async saveCheckout(code: string, linkId: string, checkout: PaymentCheckout): Promise<void> {
    await PaymentModel.updateOne({ code }, { $set: { gatewayLinkId: linkId, checkout } });
  }

  /** Pending top-ups of `gateway` whose link expired before `before` (oldest first) */
  public async listExpiredPending(gateway: 'vnpay' | 'payos', before: Date, limit = 50): Promise<PaymentRecord[]> {
    return (await PaymentModel.find({ gateway, status: 'pending', expiresAt: { $lt: before } })
      .sort({ expiresAt: 1 })
      .limit(limit)
      .lean()) as PaymentRecord[];
  }

  /** Pending top-ups of `gateway` whose link expired before `before` become failed; returns how many */
  public async failExpired(gateway: 'vnpay' | 'payos', before: Date): Promise<number> {
    const result = await PaymentModel.updateMany(
      { gateway, status: 'pending', expiresAt: { $lt: before } },
      { $set: { status: 'failed', gatewayResponseCode: 'expired' } },
    );
    return result.modifiedCount;
  }
}

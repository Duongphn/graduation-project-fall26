import { type ClientSession, type Model, Types } from 'mongoose';
import { HELD_WITHDRAWAL_STATUSES } from '../constants/wallet-transaction.js';
import { WithdrawalRequest } from '../models/index.js';

export type WithdrawalStatus = 'pending' | 'approved' | 'completed' | 'rejected';

export interface WithdrawalRecord {
  _id: Types.ObjectId;
  code?: string;
  userId: Types.ObjectId;
  amount: number;
  bankInfo: { bankName: string; accountNumber: string; accountHolderName: string };
  status: WithdrawalStatus;
  processedBy?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** The model file has no document type; this is the shape the repository reads and writes */
const WithdrawalModel = WithdrawalRequest as unknown as Model<WithdrawalRecord>;

export interface NewWithdrawal {
  id: Types.ObjectId;
  code: string;
  userId: string;
  amount: number;
  bankInfo: WithdrawalRecord['bankInfo'];
}

/** withdrawalrequests collection (UC18). One pending request per user (index one_pending_per_user). */
export class WithdrawalRepository {
  public async create(input: NewWithdrawal, session: ClientSession): Promise<WithdrawalRecord> {
    const [doc] = await WithdrawalModel.create(
      [
        {
          _id: input.id,
          code: input.code,
          userId: new Types.ObjectId(input.userId),
          amount: input.amount,
          bankInfo: input.bankInfo,
          status: 'pending',
        },
      ],
      { session },
    );
    if (!doc) throw new Error('Withdrawal request was not created.');
    return doc.toObject() as WithdrawalRecord;
  }

  public async hasPending(userId: string): Promise<boolean> {
    return (await WithdrawalModel.exists({ userId: new Types.ObjectId(userId), status: 'pending' })) !== null;
  }

  /** Newest first */
  public async listByUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: WithdrawalRecord[]; total: number }> {
    const filter = { userId: new Types.ObjectId(userId) };
    const [items, total] = await Promise.all([
      WithdrawalModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      WithdrawalModel.countDocuments(filter),
    ]);
    return { items: items as WithdrawalRecord[], total };
  }

  /** Amount of the user's requests still held in escrow (pending or approved, not paid out) */
  public async sumHeld(userId: string): Promise<number> {
    const [row] = await WithdrawalModel.aggregate<{ total: number }>([
      { $match: { userId: new Types.ObjectId(userId), status: { $in: [...HELD_WITHDRAWAL_STATUSES] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return row?.total ?? 0;
  }
}

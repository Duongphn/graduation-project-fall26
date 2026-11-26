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
  processedAt?: Date;
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

/** Filters of the Admin withdrawal queue (GET /wallets/admin/withdrawals) */
export interface AdminWithdrawalFilter {
  page: number;
  limit: number;
  status?: WithdrawalStatus | undefined;
  /** Created on or after / before (inclusive day bounds are set by the caller) */
  from?: Date | undefined;
  to?: Date | undefined;
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

  public async findById(id: string, session?: ClientSession): Promise<WithdrawalRecord | null> {
    return (await WithdrawalModel.findById(id).session(session ?? null).lean()) as WithdrawalRecord | null;
  }

  /**
   * Admin queue (index admin_queue). Pending requests oldest first (first come, first paid);
   * other statuses and "all" newest first.
   */
  public async listForAdmin(filter: AdminWithdrawalFilter): Promise<{ items: WithdrawalRecord[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.from || filter.to) {
      query.createdAt = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lte: filter.to } : {}) };
    }
    const [items, total] = await Promise.all([
      WithdrawalModel.find(query)
        .sort({ createdAt: filter.status === 'pending' ? 1 : -1 })
        .skip((filter.page - 1) * filter.limit)
        .limit(filter.limit)
        .lean(),
      WithdrawalModel.countDocuments(query),
    ]);
    return { items: items as WithdrawalRecord[], total };
  }

  /** Number of requests per status, for the Admin tabs and menu badge */
  public async countByStatus(): Promise<Partial<Record<WithdrawalStatus, number>>> {
    const rows = await WithdrawalModel.aggregate<{ _id: WithdrawalStatus; total: number }>([
      { $group: { _id: '$status', total: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((row) => [row._id, row.total]));
  }

  /**
   * Moves a pending request to its final status. Only one caller wins (the filter requires
   * 'pending'), so two Admins acting at once cannot pay out or refund it twice.
   * Returns the updated request, or null when it was not pending any more.
   */
  public async claimPending(
    id: string,
    update: { status: 'completed' | 'rejected'; processedBy: string; processedAt: Date; notes?: string | undefined },
    session: ClientSession,
  ): Promise<WithdrawalRecord | null> {
    return (await WithdrawalModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), status: 'pending' },
      {
        $set: {
          status: update.status,
          processedBy: new Types.ObjectId(update.processedBy),
          processedAt: update.processedAt,
          ...(update.notes ? { notes: update.notes } : {}),
        },
      },
      { new: true, session },
    ).lean()) as WithdrawalRecord | null;
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

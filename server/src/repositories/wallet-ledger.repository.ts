import { type ClientSession, type Model, Types } from 'mongoose';
import {
  type LedgerEntry,
  type LedgerReference,
  type SystemWalletType,
  type WalletLedgerPort,
  type WalletRecord,
} from '../interfaces/wallet.ports.js';
import {
  type IWallet,
  type IWalletTransaction,
  Wallet,
  WalletTransaction,
} from '../models/index.js';
import { AppError } from '../utils/app-error.js';

export class WalletLedgerRepository implements WalletLedgerPort {
  private readonly walletModel: Model<IWallet>;
  private readonly transactionModel: Model<IWalletTransaction>;

  public constructor(
    walletModel: Model<IWallet> = Wallet,
    transactionModel: Model<IWalletTransaction> = WalletTransaction,
  ) {
    this.walletModel = walletModel;
    this.transactionModel = transactionModel;
  }

  private toRecord(doc: IWallet): WalletRecord {
    return {
      id: doc._id.toString(),
      userId: doc.userId ? doc.userId.toString() : undefined,
      ownerType: doc.ownerType,
      balance: doc.balance,
      currency: doc.currency,
    };
  }

  public async getOrCreateUserWallet(
    userId: string,
    session?: ClientSession,
  ): Promise<WalletRecord> {
    const userObjectId = new Types.ObjectId(userId);
    try {
      let query = this.walletModel.findOneAndUpdate(
        { userId: userObjectId },
        {
          $setOnInsert: {
            userId: userObjectId,
            ownerType: 'user',
            balance: 0,
            currency: 'VND',
            status: 'active',
          },
        },
        { upsert: true, new: true },
      );
      if (session) {
        query = query.session(session);
      }
      const doc = await query.exec();
      if (!doc) {
        throw new Error('Failed to create or find user wallet');
      }
      return this.toRecord(doc);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
        let findQuery = this.walletModel.findOne({ userId: userObjectId });
        if (session) {
          findQuery = findQuery.session(session);
        }
        const found = await findQuery.exec();
        if (found) {
          return this.toRecord(found);
        }
      }
      throw err;
    }
  }

  public async getOrCreateSystemWallet(
    type: SystemWalletType,
    session?: ClientSession,
  ): Promise<WalletRecord> {
    try {
      let query = this.walletModel.findOneAndUpdate(
        { ownerType: type },
        {
          $setOnInsert: {
            ownerType: type,
            balance: 0,
            currency: 'VND',
            status: 'active',
          },
        },
        { upsert: true, new: true },
      );
      if (session) {
        query = query.session(session);
      }
      const doc = await query.exec();
      if (!doc) {
        throw new Error(`Failed to create or find system wallet of type ${type}`);
      }
      return this.toRecord(doc);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
        let findQuery = this.walletModel.findOne({ ownerType: type });
        if (session) {
          findQuery = findQuery.session(session);
        }
        const found = await findQuery.exec();
        if (found) {
          return this.toRecord(found);
        }
      }
      throw err;
    }
  }

  public async post(
    postingKey: string,
    reference: LedgerReference,
    entries: LedgerEntry[],
    session: ClientSession,
    description?: string,
  ): Promise<void> {
    let sum = 0;
    for (const entry of entries) {
      if (!Number.isInteger(entry.amount)) {
        throw new Error('UNBALANCED_POSTING');
      }
      sum += entry.amount;
    }

    if (sum !== 0) {
      throw new Error('UNBALANCED_POSTING');
    }

    const activeEntries = entries.filter((e) => e.amount !== 0);
    if (activeEntries.length === 0) {
      return;
    }

    for (const entry of activeEntries) {
      if (entry.amount < 0) {
        const debitAmount = Math.abs(entry.amount);
        const res = await this.walletModel.updateOne(
          {
            _id: new Types.ObjectId(entry.walletId),
            $or: [{ ownerType: 'external' }, { balance: { $gte: debitAmount } }],
          },
          { $inc: { balance: -debitAmount } },
          { session },
        );

        if (res.matchedCount === 0) {
          const current = await this.walletModel
            .findById(entry.walletId)
            .session(session)
            .lean();
          if (current) {
            throw new AppError(
              409,
              'INSUFFICIENT_BALANCE',
              'Số dư ví không đủ để thực hiện giao dịch',
              {
                required: debitAmount,
                balance: current.balance,
                shortfall: debitAmount - current.balance,
              },
            );
          }
          throw new AppError(404, 'WALLET_NOT_FOUND', 'Không tìm thấy ví');
        }
      } else {
        await this.walletModel.updateOne(
          { _id: new Types.ObjectId(entry.walletId) },
          { $inc: { balance: entry.amount } },
          { session },
        );
      }
    }

    // Một lần ghi cho cả bút toán; entryKey unique vẫn chặn ghi trùng khi posting bị chạy lại
    await this.transactionModel.insertMany(
      activeEntries.map((entry) => ({
        walletId: new Types.ObjectId(entry.walletId),
        entryKey: `${postingKey}:${entry.walletId}`,
        postingKey,
        amount: Math.abs(entry.amount),
        type: entry.amount > 0 ? 'credit' : 'debit',
        reference: {
          kind: reference.kind,
          id: new Types.ObjectId(reference.id),
        },
        description,
      })),
      { session },
    );
  }

  public async listTransactions(
    walletId: string,
    page: number,
    limit: number,
  ): Promise<{ items: IWalletTransaction[]; total: number }> {
    const skip = (page - 1) * limit;
    const filter = { walletId: new Types.ObjectId(walletId) };

    const [items, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.transactionModel.countDocuments(filter),
    ]);

    return { items, total };
  }
}

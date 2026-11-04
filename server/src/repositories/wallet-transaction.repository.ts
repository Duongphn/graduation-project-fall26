import mongoose, { type ClientSession, type Model, type Types } from 'mongoose';
import WalletTransaction, {
  type IWalletTransaction,
} from '../models/wallet-transaction.model.js';

export interface ListTransactionsOptions {
  page?: number | undefined;
  limit?: number | undefined;
  type?: 'credit' | 'debit' | 'all' | undefined;
  kind?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}

export class WalletTransactionRepository {
  public constructor(
    private readonly transactionModel: Model<IWalletTransaction> = WalletTransaction,
  ) {}

  public async findByPostingKey(
    postingKey: string,
    session?: ClientSession,
  ): Promise<IWalletTransaction[]> {
    const query = this.transactionModel.find({ postingKey });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async findByEntryKey(
    entryKey: string,
    session?: ClientSession,
  ): Promise<IWalletTransaction | null> {
    const query = this.transactionModel.findOne({ entryKey });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async createEntries(
    entries: Array<Partial<IWalletTransaction>>,
    session?: ClientSession,
  ): Promise<IWalletTransaction[]> {
    const options = session ? { session } : undefined;
    return this.transactionModel.create(entries, options);
  }

  public async listByWalletId(
    walletId: string | Types.ObjectId,
    options: ListTransactionsOptions = {},
  ): Promise<{ items: IWalletTransaction[]; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const queryFilter: Record<string, unknown> = {
      walletId: new mongoose.Types.ObjectId(walletId.toString()),
    };

    if (options.type && options.type !== 'all') {
      queryFilter.type = options.type;
    }

    if (options.kind && options.kind !== 'all') {
      queryFilter['reference.kind'] = options.kind;
    }

    if (options.startDate || options.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (options.startDate) {
        dateFilter.$gte = options.startDate;
      }
      if (options.endDate) {
        dateFilter.$lte = options.endDate;
      }
      queryFilter.createdAt = dateFilter;
    }

    const [items, total] = await Promise.all([
      this.transactionModel
        .find(queryFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.transactionModel.countDocuments(queryFilter).exec(),
    ]);

    return { items, total };
  }
}

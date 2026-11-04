import mongoose, { type ClientSession, type Model, type Types } from 'mongoose';
import Wallet, { type IWallet, type WalletOwnerType } from '../models/wallet.model.js';

export interface AtomicBalanceUpdateResult {
  wallet: IWallet;
  previousBalance: number;
  newBalance: number;
}

export class WalletRepository {
  public constructor(private readonly walletModel: Model<IWallet> = Wallet) {}

  public async findById(
    walletId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IWallet | null> {
    if (!walletId || !mongoose.Types.ObjectId.isValid(walletId.toString())) {
      return null;
    }
    const query = this.walletModel.findById(walletId);
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async findByUserId(
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IWallet | null> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId.toString())) {
      return null;
    }
    const query = this.walletModel.findOne({ userId });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async findSystemWallet(
    ownerType: 'escrow' | 'platform_fee' | 'platform',
    session?: ClientSession,
  ): Promise<IWallet | null> {
    const query = this.walletModel.findOne({ ownerType });
    if (session) {
      query.session(session);
    }
    return query.exec();
  }

  public async getOrCreateUserWallet(
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<IWallet> {
    const existing = await this.findByUserId(userId, session);
    if (existing) {
      return existing;
    }

    try {
      const createOptions = session ? { session } : undefined;
      const created = await this.walletModel.create(
        [
          {
            userId: new mongoose.Types.ObjectId(userId.toString()),
            ownerType: 'user' as WalletOwnerType,
            balance: 0,
            currency: 'VND',
            status: 'active',
          },
        ],
        createOptions,
      );
      const wallet = created[0];
      if (!wallet) {
        throw new Error('Failed to create user wallet.');
      }
      return wallet;
    } catch (err: unknown) {
      // In case of duplicate key race condition, retrieve the created wallet
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
        const found = await this.findByUserId(userId, session);
        if (found) {
          return found;
        }
      }
      throw err;
    }
  }

  public async getOrCreateSystemWallet(
    ownerType: 'escrow' | 'platform_fee' | 'platform',
    session?: ClientSession,
  ): Promise<IWallet> {
    const existing = await this.findSystemWallet(ownerType, session);
    if (existing) {
      return existing;
    }

    try {
      const createOptions = session ? { session } : undefined;
      const created = await this.walletModel.create(
        [
          {
            ownerType,
            balance: 0,
            currency: 'VND',
            status: 'active',
          },
        ],
        createOptions,
      );
      const wallet = created[0];
      if (!wallet) {
        throw new Error('Failed to create system wallet.');
      }
      return wallet;
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
        const found = await this.findSystemWallet(ownerType, session);
        if (found) {
          return found;
        }
      }
      throw err;
    }
  }

  /**
   * Atomic balance update with optimistic locking/conditional balance check.
   * If delta < 0, requires current balance >= abs(delta) (or minBalance if specified).
   * Returns null if condition not met (e.g., insufficient balance).
   */
  public async updateBalanceAtomic(
    walletId: string | Types.ObjectId,
    delta: number,
    session?: ClientSession,
    minBalance?: number,
  ): Promise<AtomicBalanceUpdateResult | null> {
    const filter: Record<string, unknown> = {
      _id: walletId,
      status: 'active',
    };

    if (delta < 0) {
      const requiredAmount = minBalance !== undefined ? minBalance : Math.abs(delta);
      filter.balance = { $gte: requiredAmount };
    }

    const updated = await this.walletModel
      .findOneAndUpdate<IWallet>(
        filter,
        { $inc: { balance: delta } },
        { new: true, ...(session ? { session } : {}) },
      )
      .exec();

    if (!updated) {
      return null;
    }

    const newBalance = updated.balance;
    const previousBalance = newBalance - delta;

    return {
      wallet: updated,
      previousBalance,
      newBalance,
    };
  }
}

import mongoose, { type ClientSession, type Model, type Types } from 'mongoose';
import Wallet, { type IWallet, type WalletOwnerType } from '../models/wallet.model.js';
import { RentalOrder } from '../models/rental-order.model.js';
import { PurchaseOrder } from '../models/purchase-order.model.js';
import { WithdrawalRequest } from '../models/withdrawal-request.model.js';

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

  /**
   * Tính số dư đang tạm giữ (Holding/Escrow) của người dùng:
   * 1. Tiền cọc các đơn thuê đang diễn ra (với vai trò người thuê)
   * 2. Tiền thuê chờ hoàn tất các đơn đang cho thuê (với vai trò chủ đồ)
   * 3. Tiền bán đồ chờ giao hàng hoàn tất (với vai trò người bán)
   * 4. Các yêu cầu rút tiền đang chờ duyệt
   */
  public async calculateHoldingBalance(
    userId: string | Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId.toString())) {
      return 0;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId.toString());
    const activeRentalStatuses = [
      'PAID',
      'SHIPPING',
      'IN_USE',
      'RETURNING',
      'DISPUTING',
      'paid',
      'shipping',
      'in_use',
      'returning',
      'disputing',
    ];
    const activePurchaseStatuses = [
      'PAID',
      'SHIPPING',
      'DISPUTING',
      'paid',
      'shipping',
      'disputing',
    ];

    const renterDepositsAgg = RentalOrder.aggregate<{ total?: number }>([
      { $match: { renterId: userObjectId, status: { $in: activeRentalStatuses } } },
      { $group: { _id: null, total: { $sum: '$depositAmount' } } },
    ]);
    if (session) renterDepositsAgg.session(session);

    const ownerRentalFeesAgg = RentalOrder.aggregate<{ total?: number }>([
      { $match: { ownerId: userObjectId, status: { $in: activeRentalStatuses } } },
      { $group: { _id: null, total: { $sum: '$rentalFee' } } },
    ]);
    if (session) ownerRentalFeesAgg.session(session);

    const sellerPurchaseEarningsAgg = PurchaseOrder.aggregate<{ total?: number }>([
      { $match: { sellerId: userObjectId, status: { $in: activePurchaseStatuses } } },
      { $group: { _id: null, total: { $sum: '$price' } } },
    ]);
    if (session) sellerPurchaseEarningsAgg.session(session);

    const pendingWithdrawalsAgg = WithdrawalRequest.aggregate<{ total?: number }>([
      { $match: { userId: userObjectId, status: { $in: ['pending', 'PENDING'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    if (session) pendingWithdrawalsAgg.session(session);

    const [renterDeposits, ownerRentalFees, sellerPurchaseEarnings, pendingWithdrawals] =
      await Promise.all([
        renterDepositsAgg.exec(),
        ownerRentalFeesAgg.exec(),
        sellerPurchaseEarningsAgg.exec(),
        pendingWithdrawalsAgg.exec(),
      ]);

    const totalHolding =
      (renterDeposits[0]?.total ?? 0) +
      (ownerRentalFees[0]?.total ?? 0) +
      (sellerPurchaseEarnings[0]?.total ?? 0) +
      (pendingWithdrawals[0]?.total ?? 0);

    return totalHolding;
  }
}

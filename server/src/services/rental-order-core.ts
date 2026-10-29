import { type ClientSession, type Model, Types } from 'mongoose';
import { type RentalOrderStatus } from '../constants/rental-order-status.js';
import {
  type Clock,
  type RentalNotifier,
  type RentalPhotoStorage,
  type RentalSettingsProvider,
  systemClock,
} from '../interfaces/rental-order.ports.js';
import { type WalletLedgerPort } from '../interfaces/wallet.ports.js';
import { Dispute, type IDispute } from '../models/dispute.model.js';
import {
  type IOrderStatusHistory,
  OrderStatusHistory,
} from '../models/order-status-history.model.js';
import {
  type IRentalOrder,
  RentalOrder,
  type RentalOrderDoc,
} from '../models/rental-order.model.js';
import { type IToy, Toy } from '../models/toy.model.js';
import { type IUser, User } from '../models/user.model.js';
import { withTransaction } from '../repositories/transaction.js';
import { type RentalOrderRepository } from '../repositories/rental-order.repository.js';
import { type SettleWallets, settlementEntries } from './rental-pricing.js';
import { AppError } from '../utils/app-error.js';

export interface RentalOrderServiceDeps {
  ledger: WalletLedgerPort;
  photos: RentalPhotoStorage;
  notifier: RentalNotifier;
  clock?: Clock;
  settings: RentalSettingsProvider;
  repository: RentalOrderRepository;
  toyModel?: Model<IToy>;
  userModel?: Model<IUser>;
  orderStatusHistoryModel?: Model<IOrderStatusHistory>;
  rentalOrderModel?: Model<IRentalOrder>;
  disputeModel?: Model<IDispute>;
}

export interface TransitionParams {
  orderId: string;
  from: RentalOrderStatus;
  to: RentalOrderStatus;
  changedBy: string;
  note?: string | undefined;
  set?: Record<string, unknown> | undefined;
  unset?: string[] | undefined;
  filter?: Record<string, unknown> | undefined;
  inTransaction?: (order: RentalOrderDoc, session: ClientSession) => Promise<void>;
}

/**
 * Phần dùng chung của đơn thuê: deps, chuyển trạng thái có transaction, thông báo và ghi sổ quyết toán.
 * RentalOrderService (hành động của người dùng) và RentalSystemService (hành động của scheduler) kế thừa lớp này.
 */
export class RentalOrderCore {
  protected readonly ledger: WalletLedgerPort;
  protected readonly photos: RentalPhotoStorage;
  protected readonly notifier: RentalNotifier;
  protected readonly clock: Clock;
  protected readonly settings: RentalSettingsProvider;
  protected readonly repository: RentalOrderRepository;
  protected readonly toyModel: Model<IToy>;
  protected readonly userModel: Model<IUser>;
  protected readonly orderStatusHistoryModel: Model<IOrderStatusHistory>;
  protected readonly rentalOrderModel: Model<IRentalOrder>;
  protected readonly disputeModel: Model<IDispute>;

  public constructor(deps: RentalOrderServiceDeps) {
    this.ledger = deps.ledger;
    this.photos = deps.photos;
    this.notifier = deps.notifier;
    this.clock = deps.clock ?? systemClock;
    this.settings = deps.settings;
    this.repository = deps.repository;
    this.toyModel = deps.toyModel ?? Toy;
    this.userModel = deps.userModel ?? User;
    this.orderStatusHistoryModel = deps.orderStatusHistoryModel ?? OrderStatusHistory;
    this.rentalOrderModel = deps.rentalOrderModel ?? RentalOrder;
    this.disputeModel = deps.disputeModel ?? Dispute;
  }

  /**
   * Đổi trạng thái có điều kiện `status: from` ngay trong câu update (không đọc trước),
   * rồi chạy `inTransaction` (ghi sổ, tạo dispute) và ghi lịch sử trong cùng transaction.
   */
  protected async transition(params: TransitionParams): Promise<RentalOrderDoc> {
    return withTransaction(async (session) => {
      const updateObj: Record<string, unknown> = {
        $set: { status: params.to, ...(params.set ?? {}) },
      };

      const unsetObj: Record<string, 1> = {};
      if (params.unset) {
        for (const k of params.unset) {
          unsetObj[k] = 1;
        }
      }
      if (!params.set || !('timer' in params.set)) {
        unsetObj.timer = 1;
      }
      if (Object.keys(unsetObj).length > 0) {
        updateObj.$unset = unsetObj;
      }

      const updated = await this.rentalOrderModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(params.orderId),
          status: params.from,
          ...(params.filter ?? {}),
        },
        updateObj,
        { new: true, session },
      );

      if (!updated) {
        throw new AppError(
          409,
          'INVALID_RENTAL_TRANSITION',
          'Trạng thái đơn thuê không hợp lệ hoặc đã thay đổi.',
        );
      }

      if (params.inTransaction) {
        await params.inTransaction(updated, session);
      }

      await this.orderStatusHistoryModel.create(
        [
          {
            orderType: 'RENTAL',
            orderId: updated._id,
            oldStatus: params.from,
            newStatus: params.to,
            changedBy: new Types.ObjectId(params.changedBy),
            notes: params.note,
          },
        ],
        { session },
      );

      return updated;
    });
  }

  protected async notifyParty(
    order: RentalOrderDoc | IRentalOrder,
    to: 'renter' | 'owner',
    title: string,
    body: string,
  ): Promise<void> {
    try {
      const targetUserId = to === 'renter' ? order.renterId.toString() : order.ownerId.toString();
      await this.notifier.notify({ userId: targetUserId, title, body });
    } catch {
      // Swallows error
    }
  }

  /** Tạo sẵn 4 ví quyết toán ngoài transaction (xem ghi chú ở `pay`). */
  protected async prepareSettleWallets(order: RentalOrderDoc): Promise<SettleWallets> {
    const [escrow, owner, platform, renter] = await Promise.all([
      this.ledger.getOrCreateSystemWallet('escrow'),
      this.ledger.getOrCreateUserWallet(order.ownerId.toString()),
      this.ledger.getOrCreateSystemWallet('platform'),
      this.ledger.getOrCreateUserWallet(order.renterId.toString()),
    ]);
    return { escrow: escrow.id, owner: owner.id, platform: platform.id, renter: renter.id };
  }

  protected async postSettleLedger(
    order: RentalOrderDoc,
    wallets: SettleWallets,
    session: ClientSession,
  ): Promise<void> {
    const entries = settlementEntries(
      {
        rentalFee: order.pricing.rentalFee,
        depositAmount: order.pricing.depositAmount,
        platformFee: order.pricing.platformFee,
        lateFee: order.returnInfo?.lateFee ?? 0,
      },
      wallets,
    );

    if (entries.length > 0) {
      await this.ledger.post(
        `rental:${order._id.toString()}:settle`,
        { kind: 'rental_order', id: order._id.toString() },
        entries,
        session,
        'Quyết toán đơn thuê hoàn tất',
      );
    }
  }
}

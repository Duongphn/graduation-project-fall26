import { randomUUID } from 'node:crypto';
import mongoose, { type Model } from 'mongoose';
import {
  type WalletTransactionDirection,
  type WalletTransactionType,
  walletTransactionTypeKinds,
} from '../constants/wallet-transaction.js';
import {
  type WalletHoldings,
  type WalletHoldingsPort,
  type WalletLedgerPort,
} from '../interfaces/wallet.ports.js';
import { type IWalletTransaction } from '../models/index.js';
import { WalletHoldingsRepository } from '../repositories/wallet-holdings.repository.js';
import { type IUser, User } from '../models/user.model.js';
import { withTransaction } from '../repositories/transaction.js';
import { type RequestActor } from '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';

export interface WalletTransactionItemDto {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  description?: string | undefined;
  reference?: { kind: string; id: string } | undefined;
  createdAt: Date;
}

export interface WalletSummaryDto {
  /** Same as availableBalance (kept for older clients). */
  balance: number;
  /** Spendable now. */
  availableBalance: number;
  /** Not spendable yet but still the user's: sum of `holdings`. */
  holdingBalance: number;
  holdings: WalletHoldings;
  currency: string;
  transactions: WalletTransactionItemDto[];
  total: number;
  page: number;
  limit: number;
}

export interface TransactionListQuery {
  page: number;
  limit: number;
  type?: WalletTransactionType | undefined;
  direction?: WalletTransactionDirection | undefined;
}

export interface AdminCreditDto {
  postingKey: string;
  walletId: string;
  amount: number;
  balance: number;
}

export class WalletService {
  private readonly ledger: WalletLedgerPort;
  private readonly userModel: Model<IUser>;
  private readonly holdings: WalletHoldingsPort;

  public constructor(
    ledger: WalletLedgerPort,
    userModel: Model<IUser> = User,
    holdings: WalletHoldingsPort = new WalletHoldingsRepository(),
  ) {
    this.ledger = ledger;
    this.userModel = userModel;
    this.holdings = holdings;
  }

  private toTransactionDto(t: IWalletTransaction): WalletTransactionItemDto {
    return {
      id: t._id.toString(),
      amount: t.amount,
      type: t.type,
      description: t.description ?? undefined,
      reference: t.reference?.kind && t.reference.id
        ? { kind: t.reference.kind, id: t.reference.id.toString() }
        : undefined,
      createdAt: t.createdAt,
    };
  }

  public async getMyWallet(
    actor: RequestActor,
    query: { page: number; limit: number },
  ): Promise<WalletSummaryDto> {
    const wallet = await this.ledger.getOrCreateUserWallet(actor.userId);
    const [{ items, total }, holdings] = await Promise.all([
      this.ledger.listTransactions(wallet.id, query.page, query.limit),
      this.holdings.getHoldings(actor.userId),
    ]);

    return {
      balance: wallet.balance,
      availableBalance: wallet.balance,
      holdingBalance: holdings.rentals,
      holdings,
      currency: wallet.currency,
      transactions: items.map((t) => this.toTransactionDto(t)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** History of the signed-in user's wallet, newest first, filtered by type and direction. */
  public async listMyTransactions(
    actor: RequestActor,
    query: TransactionListQuery,
  ): Promise<{ items: WalletTransactionItemDto[]; total: number }> {
    const wallet = await this.ledger.getOrCreateUserWallet(actor.userId);
    const { items, total } = await this.ledger.listTransactions(wallet.id, query.page, query.limit, {
      kinds: query.type ? walletTransactionTypeKinds[query.type] : undefined,
      direction: query.direction,
    });
    return { items: items.map((t) => this.toTransactionDto(t)), total };
  }

  public async adminCredit(
    _actor: RequestActor,
    userId: string,
    input: { amount: number; note?: string | undefined },
  ): Promise<AdminCreditDto> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Người dùng không tồn tại.');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Người dùng không tồn tại.');
    }

    // Tạo ví ngoài transaction: lỗi trùng khoá khi upsert trong transaction sẽ huỷ cả transaction
    const [userWallet, externalWallet] = await Promise.all([
      this.ledger.getOrCreateUserWallet(userId),
      this.ledger.getOrCreateSystemWallet('external'),
    ]);

    const postingKey = `credit:${randomUUID()}`;
    const refId = new mongoose.Types.ObjectId().toString();

    await withTransaction((session) =>
      this.ledger.post(
        postingKey,
        { kind: 'admin_credit', id: refId },
        [
          { walletId: externalWallet.id, amount: -input.amount },
          { walletId: userWallet.id, amount: input.amount },
        ],
        session,
        input.note,
      ),
    );

    // Đọc lại sau commit: số dư đọc trước transaction có thể đã cũ nếu có giao dịch chạy song song
    const after = await this.ledger.getOrCreateUserWallet(userId);
    return {
      postingKey,
      walletId: userWallet.id,
      amount: input.amount,
      balance: after.balance,
    };
  }
}

import { randomUUID } from 'node:crypto';
import mongoose, { type Model } from 'mongoose';
import { type WalletTransactionListType } from '../constants/wallet-transaction.js';
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

/** Query of GET /wallets/me/transactions, same names as the lead's API. */
export interface TransactionListQuery {
  page: number;
  limit: number;
  /** all (default) | credit | debit */
  type?: WalletTransactionListType | undefined;
  /** reference.kind, e.g. rental_order, payment; `all` = no filter */
  kind?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}

/** One line of the wallet history, same fields as the lead's WalletTransactionDto. */
export interface WalletStatementItemDto {
  id: string;
  walletId: string;
  entryKey: string;
  postingKey: string;
  amount: number;
  type: 'credit' | 'debit';
  reference?: { kind?: string | undefined; id?: string | undefined } | undefined;
  description?: string | undefined;
  createdAt: string;
}

/** Response data of GET /wallets/me/transactions, same as the lead's PaginatedTransactionsDto. */
export interface PaginatedTransactionsDto {
  items: WalletStatementItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
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
      holdingBalance: holdings.rentals + (holdings.purchases ?? 0) + holdings.withdrawals,
      holdings,
      currency: wallet.currency,
      transactions: items.map((t) => this.toTransactionDto(t)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private toStatementDto(t: IWalletTransaction): WalletStatementItemDto {
    return {
      id: t._id.toString(),
      walletId: t.walletId.toString(),
      entryKey: t.entryKey,
      postingKey: t.postingKey,
      amount: t.amount,
      type: t.type,
      ...(t.reference
        ? { reference: { kind: t.reference.kind, id: t.reference.id?.toString() } }
        : {}),
      ...(t.description ? { description: t.description } : {}),
      createdAt: t.createdAt.toISOString(),
    };
  }

  /**
   * History of the signed-in user's wallet, newest first (View Wallet Transactions).
   * Filters and response follow the lead's GET /wallets/me/transactions.
   */
  public async listMyTransactions(
    actor: RequestActor,
    query: TransactionListQuery,
  ): Promise<PaginatedTransactionsDto> {
    const wallet = await this.ledger.getOrCreateUserWallet(actor.userId);
    const { items, total } = await this.ledger.listTransactions(wallet.id, query.page, query.limit, {
      kind: query.kind && query.kind !== 'all' ? query.kind : undefined,
      direction: query.type && query.type !== 'all' ? query.type : undefined,
      startDate: query.startDate,
      endDate: query.endDate,
    });
    const totalPages = Math.ceil(total / query.limit) || 1;

    return {
      items: items.map((t) => this.toStatementDto(t)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPrevPage: query.page > 1,
    };
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

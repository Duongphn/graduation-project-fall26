import { randomUUID } from 'node:crypto';
import mongoose, { type Model } from 'mongoose';
import { type WalletLedgerPort } from '../interfaces/wallet.ports.js';
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
  balance: number;
  currency: string;
  transactions: WalletTransactionItemDto[];
  total: number;
  page: number;
  limit: number;
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

  public constructor(ledger: WalletLedgerPort, userModel: Model<IUser> = User) {
    this.ledger = ledger;
    this.userModel = userModel;
  }

  public async getMyWallet(
    actor: RequestActor,
    query: { page: number; limit: number },
  ): Promise<WalletSummaryDto> {
    const wallet = await this.ledger.getOrCreateUserWallet(actor.userId);
    const { items, total } = await this.ledger.listTransactions(
      wallet.id,
      query.page,
      query.limit,
    );

    const transactions: WalletTransactionItemDto[] = items.map((t) => ({
      id: t._id.toString(),
      amount: t.amount,
      type: t.type,
      description: t.description ?? undefined,
      reference: t.reference?.kind && t.reference.id
        ? { kind: t.reference.kind, id: t.reference.id.toString() }
        : undefined,
      createdAt: t.createdAt,
    }));

    return {
      balance: wallet.balance,
      currency: wallet.currency,
      transactions,
      total,
      page: query.page,
      limit: query.limit,
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

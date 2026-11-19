import { randomInt } from 'node:crypto';
import { Types } from 'mongoose';
import type { WalletLedgerPort } from '../interfaces/wallet.ports.js';
import { withTransaction } from '../repositories/transaction.js';
import type { WithdrawalRecord, WithdrawalRepository } from '../repositories/withdrawal.repository.js';
import type { RequestActor } from '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';
import { isDuplicateKeyError } from '../utils/mongo-errors.js';

export interface WithdrawalInput {
  amount: number;
  bankInfo: { bankName: string; accountNumber: string; accountHolderName: string };
}

/** Same fields as the lead's WithdrawalRequestDto */
export interface WithdrawalRequestDto {
  id: string;
  code?: string | undefined;
  userId: string;
  amount: number;
  bankInfo: WithdrawalInput['bankInfo'];
  status: WithdrawalRecord['status'];
  notes?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

/** Same fields as the lead's PaginatedWithdrawalsDto */
export interface PaginatedWithdrawalsDto {
  items: WithdrawalRequestDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const pendingExists = () =>
  new AppError(
    409,
    'PENDING_WITHDRAWAL_EXISTS',
    'Bạn đang có một yêu cầu rút tiền đang chờ xử lý. Vui lòng đợi hoàn tất trước khi tạo yêu cầu mới.',
  );

/** "0123456789" → "****6789" (the full number stays in the withdrawal request only) */
const maskAccount = (accountNumber: string) => `****${accountNumber.slice(-4)}`;

const toDto = (record: WithdrawalRecord): WithdrawalRequestDto => ({
  id: record._id.toString(),
  ...(record.code ? { code: record.code } : {}),
  userId: record.userId.toString(),
  amount: record.amount,
  bankInfo: {
    bankName: record.bankInfo.bankName,
    accountNumber: record.bankInfo.accountNumber,
    accountHolderName: record.bankInfo.accountHolderName,
  },
  status: record.status,
  ...(record.notes ? { notes: record.notes } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

/**
 * UC18 Request withdrawal: the request is created pending and its amount moves from the user's
 * wallet to escrow in the same transaction (not enough balance → nothing is created). An Admin
 * pays it out or refunds it later.
 */
export class WithdrawalService {
  public constructor(
    private readonly withdrawals: WithdrawalRepository,
    private readonly ledger: WalletLedgerPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async requestWithdrawal(actor: RequestActor, input: WithdrawalInput): Promise<WithdrawalRequestDto> {
    if (await this.withdrawals.hasPending(actor.userId)) throw pendingExists();

    // Wallets are created before the transaction: a duplicate-key upsert inside it would abort it
    const [userWallet, escrowWallet] = await Promise.all([
      this.ledger.getOrCreateUserWallet(actor.userId),
      this.ledger.getOrCreateSystemWallet('escrow'),
    ]);
    const id = new Types.ObjectId();
    const code = `WD${this.now().getTime()}${randomInt(100, 1000)}`;

    try {
      const created = await withTransaction(async (session) => {
        const record = await this.withdrawals.create(
          { id, code, userId: actor.userId, amount: input.amount, bankInfo: input.bankInfo },
          session,
        );
        // Throws 409 INSUFFICIENT_BALANCE when the available balance is too low (the request is rolled back)
        await this.ledger.post(
          `withdrawal:${id.toString()}:hold`,
          { kind: 'withdrawal', id: id.toString() },
          [
            { walletId: userWallet.id, amount: -input.amount },
            { walletId: escrowWallet.id, amount: input.amount },
          ],
          session,
          `Rút tiền về ${input.bankInfo.bankName} ${maskAccount(input.bankInfo.accountNumber)} (${code})`,
        );
        return record;
      });
      return toDto(created);
    } catch (error) {
      // Two requests at once: the one_pending_per_user index refuses the second
      if (isDuplicateKeyError(error)) throw pendingExists();
      throw error;
    }
  }

  public async listMyWithdrawals(
    actor: RequestActor,
    query: { page: number; limit: number },
  ): Promise<PaginatedWithdrawalsDto> {
    const { items, total } = await this.withdrawals.listByUser(actor.userId, query.page, query.limit);
    const totalPages = Math.ceil(total / query.limit) || 1;
    return {
      items: items.map(toDto),
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPrevPage: query.page > 1,
    };
  }
}

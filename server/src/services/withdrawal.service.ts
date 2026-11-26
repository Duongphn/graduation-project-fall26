import { randomInt } from 'node:crypto';
import { Types } from 'mongoose';
import type { WalletLedgerPort } from '../interfaces/wallet.ports.js';
import { User } from '../models/index.js';
import { adminAuditEntry, writeAuditLog } from '../repositories/audit-log.repository.js';
import { withTransaction } from '../repositories/transaction.js';
import type { WithdrawalRecord, WithdrawalRepository } from '../repositories/withdrawal.repository.js';
import type { RequestActor } from '../types/request-actor.js';
import type { AdminContext } from '../utils/admin-context.js';
import { AppError } from '../utils/app-error.js';
import { isDuplicateKeyError } from '../utils/mongo-errors.js';
import { notify } from '../utils/notify.js';
import type { AdminProcessWithdrawalBody, AdminWithdrawalListQuery } from '../validations/wallet.validation.js';
import { assertWalletNotFrozen } from './account-lock.service.js';

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
  /** When an Admin paid it out or refused it */
  processedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

/** Same fields as the lead's AdminWithdrawalRequestDto: the request with its owner */
export interface AdminWithdrawalDto extends WithdrawalRequestDto {
  user: { id: string; fullName?: string | undefined; email?: string | undefined; phone?: string | undefined };
  processedBy?: string | undefined;
}

export interface PaginatedAdminWithdrawalsDto extends Omit<PaginatedWithdrawalsDto, 'items'> {
  items: AdminWithdrawalDto[];
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
  ...(record.processedAt ? { processedAt: record.processedAt.toISOString() } : {}),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A day picked in Vietnam (sent as YYYY-MM-DD) → its first / last instant, for the Admin date filter */
const vietnamDayBound = (date: Date, end: boolean) => {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(day - VIETNAM_OFFSET_MS + (end ? DAY_MS - 1 : 0));
};

const notFound = () => new AppError(404, 'WITHDRAWAL_NOT_FOUND', 'Không tìm thấy yêu cầu rút tiền.');

const alreadyProcessed = (status: string) =>
  new AppError(
    409,
    'WITHDRAWAL_ALREADY_PROCESSED',
    `Yêu cầu rút tiền này đã được xử lý trước đó (trạng thái hiện tại: ${status}).`,
  );

type Owner = { fullName?: string; email?: string; phone?: string };

/**
 * UC18 Request withdrawal: the request is created pending and its amount moves from the user's
 * wallet to escrow in the same transaction (not enough balance → nothing is created).
 * Admin process withdrawal: the Admin transfers the money to the user's bank and marks the
 * request completed (escrow → external), or refuses it with a reason (escrow → back to the wallet).
 */
export class WithdrawalService {
  public constructor(
    private readonly withdrawals: WithdrawalRepository,
    private readonly ledger: WalletLedgerPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async requestWithdrawal(actor: RequestActor, input: WithdrawalInput): Promise<WithdrawalRequestDto> {
    // A locked account's wallet is frozen: no money leaves it (account-lock.service)
    await assertWalletNotFrozen(actor.userId);
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
  /** GET /wallets/admin/withdrawals: the queue with each request's owner */
  public async listForAdmin(query: AdminWithdrawalListQuery): Promise<PaginatedAdminWithdrawalsDto> {
    const status = query.status && query.status !== 'all' ? query.status : undefined;
    const { items, total } = await this.withdrawals.listForAdmin({
      page: query.page,
      limit: query.limit,
      status,
      from: query.startDate ? vietnamDayBound(query.startDate, false) : undefined,
      to: query.endDate ? vietnamDayBound(query.endDate, true) : undefined,
    });
    const owners = await this.ownersOf(items);
    const totalPages = Math.ceil(total / query.limit) || 1;
    return {
      items: items.map((item) => this.toAdminDto(item, owners)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPrevPage: query.page > 1,
    };
  }

  /** GET /wallets/admin/withdrawals/counts: requests per status (tabs, menu badge) */
  public async countsForAdmin(): Promise<Record<'pending' | 'completed' | 'rejected', number>> {
    const counts = await this.withdrawals.countByStatus();
    return { pending: counts.pending ?? 0, completed: counts.completed ?? 0, rejected: counts.rejected ?? 0 };
  }

  /**
   * PATCH /wallets/admin/withdrawals/:id/process. Only a pending request can be processed.
   * - completed (or approved): the Admin has transferred the money; escrow → external.
   *   Refused while the owner's account is locked (frozen wallet: no money leaves it).
   * - rejected: the amount goes back to the user's wallet; the reason is shown to the user.
   * The status change, the ledger posting and the audit row are one transaction, and the status
   * changes only from 'pending', so the money moves once even when two Admins act together.
   */
  public async processByAdmin(
    context: AdminContext,
    id: string,
    input: AdminProcessWithdrawalBody,
  ): Promise<AdminWithdrawalDto> {
    if (!Types.ObjectId.isValid(id)) throw notFound();
    const existing = await this.withdrawals.findById(id);
    if (!existing) throw notFound();
    if (existing.status !== 'pending') throw alreadyProcessed(existing.status);

    const status: 'completed' | 'rejected' = input.status === 'rejected' ? 'rejected' : 'completed';
    const userId = existing.userId.toString();
    if (status === 'completed') await assertWalletNotFrozen(userId);

    const notes = input.notes?.trim() || undefined;
    const code = existing.code ?? id;
    const account = `${existing.bankInfo.bankName} ${maskAccount(existing.bankInfo.accountNumber)}`;

    // Wallets are created before the transaction: a duplicate-key upsert inside it would abort it
    const [escrowWallet, targetWallet] = await Promise.all([
      this.ledger.getOrCreateSystemWallet('escrow'),
      status === 'completed'
        ? this.ledger.getOrCreateSystemWallet('external')
        : this.ledger.getOrCreateUserWallet(userId),
    ]);

    const processed = await withTransaction(async (session) => {
      const claimed = await this.withdrawals.claimPending(
        id,
        { status, processedBy: context.actor.actorId, processedAt: this.now(), notes },
        session,
      );
      if (!claimed) return null;

      await this.ledger.post(
        `withdrawal:${id}:${status === 'completed' ? 'payout' : 'refund'}`,
        { kind: 'withdrawal', id },
        [
          { walletId: escrowWallet.id, amount: -existing.amount },
          { walletId: targetWallet.id, amount: existing.amount },
        ],
        session,
        status === 'completed'
          ? `Đã chuyển tiền rút về ${account} (${code})`
          : `Hoàn tiền lệnh rút ${code} bị từ chối${notes ? `: ${notes}` : ''}`,
      );
      await writeAuditLog(
        adminAuditEntry(
          context,
          status === 'completed' ? 'withdrawal.complete' : 'withdrawal.reject',
          { kind: 'WITHDRAWAL_REQUEST', id },
          { code, amount: existing.amount, userId, ...(notes ? { notes } : {}) },
        ),
        session,
      );
      return claimed;
    });
    // Another Admin processed it between the read above and the transaction
    if (!processed) throw alreadyProcessed((await this.withdrawals.findById(id))?.status ?? 'unknown');

    const amount = `${existing.amount.toLocaleString('vi-VN')} đ`;
    notify({
      type: 'WALLET',
      to: [userId],
      link: '/wallet',
      actorId: context.actor.actorId,
      ...(status === 'completed'
        ? {
            title: 'Yêu cầu rút tiền thành công',
            body: `ToyFlow đã chuyển ${amount} về tài khoản ${account} (lệnh ${code}).`,
          }
        : {
            title: 'Yêu cầu rút tiền bị từ chối',
            body: `Lệnh rút ${amount} (${code}) bị từ chối. Lý do: ${notes ?? 'Không hợp lệ'}. Số tiền đã được hoàn lại vào ví của bạn.`,
          }),
    });

    return this.toAdminDto(processed, await this.ownersOf([processed]));
  }

  private async ownersOf(items: WithdrawalRecord[]): Promise<Map<string, Owner>> {
    const ids = [...new Set(items.map((item) => item.userId.toString()))];
    if (ids.length === 0) return new Map();
    const users = (await User.find({ _id: { $in: ids } })
      .select('fullName email phone')
      .lean()) as unknown as Array<Owner & { _id: Types.ObjectId }>;
    return new Map(users.map(({ _id, ...owner }) => [_id.toString(), owner]));
  }

  private toAdminDto(record: WithdrawalRecord, owners: Map<string, Owner>): AdminWithdrawalDto {
    const owner = owners.get(record.userId.toString());
    return {
      ...toDto(record),
      user: {
        id: record.userId.toString(),
        ...(owner?.fullName ? { fullName: owner.fullName } : {}),
        ...(owner?.email ? { email: owner.email } : {}),
        ...(owner?.phone ? { phone: owner.phone } : {}),
      },
      ...(record.processedBy ? { processedBy: record.processedBy.toString() } : {}),
    };
  }
}

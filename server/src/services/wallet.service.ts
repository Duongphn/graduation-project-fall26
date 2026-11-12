import mongoose from 'mongoose';
import type { IWallet } from '../models/wallet.model.js';
import type { IWalletTransaction } from '../models/wallet-transaction.model.js';
import type { IWithdrawalRequest } from '../models/withdrawal-request.model.js';
import { WalletRepository } from '../repositories/wallet.repository.js';
import { WalletTransactionRepository } from '../repositories/wallet-transaction.repository.js';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.js';
import { LedgerService } from './ledger.service.js';
import type {
  CreateWithdrawalInput,
  PaginatedTransactionsDto,
  PaginatedWithdrawalsDto,
  WalletDto,
  WalletTransactionDto,
  WithdrawalRequestDto,
} from '../types/wallet.types.js';
import { AppError } from '../utils/app-error.js';

export class WalletService {
  public constructor(
    private readonly walletRepository: WalletRepository = new WalletRepository(),
    private readonly transactionRepository: WalletTransactionRepository = new WalletTransactionRepository(),
    private readonly withdrawalRepository: WithdrawalRepository = new WithdrawalRepository(),
    private readonly ledgerService?: LedgerService,
  ) {
    if (!this.ledgerService) {
      this.ledgerService = new LedgerService(this.walletRepository, this.transactionRepository);
    }
  }

  private mapWithdrawalToDto(withdrawal: IWithdrawalRequest): WithdrawalRequestDto {
    const dto: WithdrawalRequestDto = {
      id: withdrawal._id.toString(),
      userId: withdrawal.userId.toString(),
      amount: withdrawal.amount,
      bankInfo: {
        bankName: withdrawal.bankInfo.bankName,
        accountNumber: withdrawal.bankInfo.accountNumber,
        accountHolderName: withdrawal.bankInfo.accountHolderName,
      },
      status: withdrawal.status,
      createdAt: withdrawal.createdAt ? withdrawal.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: withdrawal.updatedAt ? withdrawal.updatedAt.toISOString() : new Date().toISOString(),
    };

    if (withdrawal.code) {
      dto.code = withdrawal.code;
    }
    if (withdrawal.processedBy) {
      dto.processedBy = withdrawal.processedBy.toString();
    }
    if (withdrawal.notes !== undefined) {
      dto.notes = withdrawal.notes;
    }

    return dto;
  }

  private mapWalletToDto(wallet: IWallet, holdingBalance = 0): WalletDto {
    return {
      id: wallet._id.toString(),
      userId: wallet.userId ? wallet.userId.toString() : null,
      ownerType: wallet.ownerType,
      balance: wallet.balance,
      availableBalance: wallet.balance,
      holdingBalance,
      currency: wallet.currency,
      status: wallet.status,
      createdAt: wallet.createdAt ? wallet.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: wallet.updatedAt ? wallet.updatedAt.toISOString() : new Date().toISOString(),
    };
  }

  private mapTransactionToDto(tx: IWalletTransaction): WalletTransactionDto {
    const dto: WalletTransactionDto = {
      id: tx._id.toString(),
      walletId: tx.walletId.toString(),
      entryKey: tx.entryKey,
      postingKey: tx.postingKey,
      amount: tx.amount,
      type: tx.type,
      createdAt: tx.createdAt ? tx.createdAt.toISOString() : new Date().toISOString(),
    };

    if (tx.balanceBefore !== undefined) {
      dto.balanceBefore = tx.balanceBefore;
    }
    if (tx.balanceAfter !== undefined) {
      dto.balanceAfter = tx.balanceAfter;
    }
    if (tx.reference) {
      dto.reference = {
        kind: tx.reference.kind,
        id: tx.reference.id ? tx.reference.id.toString() : undefined,
      };
    }
    if (tx.description !== undefined) {
      dto.description = tx.description;
    }

    return dto;
  }

  public async getMyWallet(userId: string): Promise<WalletDto> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(400, 'INVALID_USER_ID', 'Invalid user ID.');
    }

    const wallet = await this.walletRepository.getOrCreateUserWallet(userId);
    const holdingBalance = await this.walletRepository.calculateHoldingBalance(userId);
    return this.mapWalletToDto(wallet, holdingBalance);
  }

  public async getMyTransactions(
    userId: string,
    query: {
      page?: number | undefined;
      limit?: number | undefined;
      type?: 'credit' | 'debit' | 'all' | undefined;
      kind?: string | undefined;
      startDate?: Date | undefined;
      endDate?: Date | undefined;
    } = {},
  ): Promise<PaginatedTransactionsDto> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(400, 'INVALID_USER_ID', 'Invalid user ID.');
    }

    const wallet = await this.walletRepository.getOrCreateUserWallet(userId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));

    const { items, total } = await this.transactionRepository.listByWalletId(wallet._id, {
      page,
      limit,
      type: query.type,
      kind: query.kind,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const totalPages = Math.ceil(total / limit) || 1;
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return {
      items: items.map((item) => this.mapTransactionToDto(item)),
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPrevPage,
    };
  }

  public async getSystemWallet(
    ownerType: 'escrow' | 'platform_fee' | 'platform',
  ): Promise<WalletDto> {
    if (!['escrow', 'platform_fee', 'platform'].includes(ownerType)) {
      throw new AppError(400, 'INVALID_OWNER_TYPE', 'Invalid system wallet type.');
    }

    const wallet = await this.walletRepository.getOrCreateSystemWallet(ownerType);
    return this.mapWalletToDto(wallet);
  }

  public async requestWithdrawal(
    userId: string,
    input: CreateWithdrawalInput,
  ): Promise<WithdrawalRequestDto> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(400, 'INVALID_USER_ID', 'Invalid user ID.');
    }

    // 1. Kiểm tra xem người dùng có yêu cầu rút tiền nào đang ở trạng thái pending không
    const pendingRequest = await this.withdrawalRepository.findPendingByUserId(userId);
    if (pendingRequest) {
      throw new AppError(
        400,
        'PENDING_WITHDRAWAL_EXISTS',
        'Bạn đang có một yêu cầu rút tiền đang chờ xử lý. Vui lòng đợi hoàn tất trước khi tạo yêu cầu mới.',
      );
    }

    // 2. Lấy thông tin ví và kiểm tra trạng thái ví
    const wallet = await this.walletRepository.getOrCreateUserWallet(userId);
    if (wallet.status !== 'active') {
      throw new AppError(400, 'WALLET_INACTIVE', 'Ví người dùng đang bị khóa hoặc không hoạt động.');
    }

    // 3. Kiểm tra số dư ví
    if (wallet.balance < input.amount) {
      throw new AppError(
        400,
        'INSUFFICIENT_BALANCE',
        'Số dư ví không đủ để thực hiện yêu cầu rút tiền.',
      );
    }

    const timestamp = Date.now();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const code = `WD_${timestamp}_${randomSuffix}`;
    const withdrawalId = new mongoose.Types.ObjectId();

    // 4. Tạm trừ số dư ví qua LedgerService (ghi bút toán debit sổ cái nguyên tử kèm postingKey)
    await this.ledgerService!.recordSingleEntry({
      walletId: wallet._id,
      postingKey: `withdrawal_${code}`,
      amount: input.amount,
      type: 'debit',
      reference: {
        kind: 'withdrawal',
        id: withdrawalId,
      },
      description: `Yêu cầu rút tiền về ${input.bankInfo.bankName} - ${input.bankInfo.accountNumber} (${code})`,
    });

    // 5. Tạo bản ghi WithdrawalRequest ở trạng thái pending
    try {
      const withdrawal = await this.withdrawalRepository.create({
        _id: withdrawalId,
        code,
        userId: new mongoose.Types.ObjectId(userId),
        amount: input.amount,
        bankInfo: {
          bankName: input.bankInfo.bankName.trim(),
          accountNumber: input.bankInfo.accountNumber.trim(),
          accountHolderName: input.bankInfo.accountHolderName.trim().toUpperCase(),
        },
        status: 'pending',
      });

      return this.mapWithdrawalToDto(withdrawal);
    } catch (createError) {
      // Nếu tạo bản ghi thất bại (ví dụ: đụng unique index pending do race condition), hoàn lại tiền vào ví
      await this.ledgerService!.recordSingleEntry({
        walletId: wallet._id,
        postingKey: `refund_failed_wd_${code}`,
        amount: input.amount,
        type: 'credit',
        reference: {
          kind: 'adjustment',
          id: withdrawalId,
        },
        description: `Hoàn tiền yêu cầu rút lỗi (${code})`,
      });

      if (
        typeof createError === 'object' &&
        createError !== null &&
        'code' in createError &&
        (createError as { code: number }).code === 11000
      ) {
        throw new AppError(
          400,
          'PENDING_WITHDRAWAL_EXISTS',
          'Bạn đang có một yêu cầu rút tiền đang chờ xử lý.',
        );
      }

      throw createError;
    }
  }

  public async getMyWithdrawals(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<PaginatedWithdrawalsDto> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(400, 'INVALID_USER_ID', 'Invalid user ID.');
    }

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));

    const { items, total } = await this.withdrawalRepository.listByUserId(userId, { page, limit });

    const totalPages = Math.ceil(total / limit) || 1;
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return {
      items: items.map((item) => this.mapWithdrawalToDto(item)),
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPrevPage,
    };
  }
}


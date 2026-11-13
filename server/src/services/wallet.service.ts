import mongoose from 'mongoose';
import type { IWallet } from '../models/wallet.model.js';
import type { IWalletTransaction } from '../models/wallet-transaction.model.js';
import type { IWithdrawalRequest } from '../models/withdrawal-request.model.js';
import { WalletRepository } from '../repositories/wallet.repository.js';
import { WalletTransactionRepository } from '../repositories/wallet-transaction.repository.js';
import { WithdrawalRepository } from '../repositories/withdrawal.repository.js';
import { NotificationRepository } from '../repositories/notification.repository.js';
import { LedgerService } from './ledger.service.js';
import type {
  AdminProcessWithdrawalInput,
  AdminWithdrawalQuery,
  AdminWithdrawalRequestDto,
  CreateWithdrawalInput,
  PaginatedAdminWithdrawalsDto,
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
    private readonly notificationRepository: NotificationRepository = new NotificationRepository(),
  ) {
    if (!this.ledgerService) {
      this.ledgerService = new LedgerService(this.walletRepository, this.transactionRepository);
    }
  }

  private mapAdminWithdrawalToDto(
    withdrawal: IWithdrawalRequest & { userId?: unknown },
  ): AdminWithdrawalRequestDto {
    const baseDto = this.mapWithdrawalToDto(withdrawal);
    const adminDto: AdminWithdrawalRequestDto = {
      ...baseDto,
    };

    if (withdrawal.processedAt) {
      adminDto.processedAt = withdrawal.processedAt.toISOString();
    }

    if (
      withdrawal.userId &&
      typeof withdrawal.userId === 'object' &&
      '_id' in (withdrawal.userId as unknown as Record<string, unknown>)
    ) {
      const userObj = withdrawal.userId as unknown as Record<string, unknown>;
      adminDto.user = {
        id: String(userObj._id),
        fullName: String(userObj.fullName || ''),
        email: String(userObj.email || ''),
        phone: userObj.phone ? String(userObj.phone) : undefined,
        avatar: userObj.avatar ? String(userObj.avatar) : undefined,
      };
      adminDto.userId = String(userObj._id);
    }

    return adminDto;
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

  public async adminListWithdrawals(
    query: AdminWithdrawalQuery = {},
  ): Promise<PaginatedAdminWithdrawalsDto> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));

    const { items, total } = await this.withdrawalRepository.listForAdmin({
      page,
      limit,
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const totalPages = Math.ceil(total / limit) || 1;
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return {
      items: items.map((item) => this.mapAdminWithdrawalToDto(item)),
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPrevPage,
    };
  }

  public async adminProcessWithdrawal(
    adminId: string,
    withdrawalId: string,
    input: AdminProcessWithdrawalInput,
  ): Promise<AdminWithdrawalRequestDto> {
    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      throw new AppError(400, 'INVALID_ADMIN_ID', 'Invalid admin ID.');
    }
    if (!withdrawalId || !mongoose.Types.ObjectId.isValid(withdrawalId)) {
      throw new AppError(400, 'INVALID_WITHDRAWAL_ID', 'Invalid withdrawal request ID.');
    }

    const existing = await this.withdrawalRepository.findById(withdrawalId);
    if (!existing) {
      throw new AppError(404, 'WITHDRAWAL_NOT_FOUND', 'Không tìm thấy yêu cầu rút tiền.');
    }

    if (existing.status !== 'pending') {
      throw new AppError(
        400,
        'WITHDRAWAL_ALREADY_PROCESSED',
        `Yêu cầu rút tiền này đã được xử lý trước đó (trạng thái hiện tại: ${existing.status}).`,
      );
    }

    const targetStatus = input.status === 'approved' ? 'completed' : input.status;

    // 1. Nếu từ chối (rejected): Hoàn trả lại số dư ví cho người dùng
    if (targetStatus === 'rejected') {
      const userWallet = await this.walletRepository.findByUserId(existing.userId);
      if (!userWallet) {
        throw new AppError(404, 'WALLET_NOT_FOUND', 'Không tìm thấy ví của người dùng để hoàn tiền.');
      }

      const refundCode = existing.code ?? existing._id.toString();
      await this.ledgerService!.recordSingleEntry({
        walletId: userWallet._id,
        postingKey: `refund_rejected_wd_${refundCode}`,
        amount: existing.amount,
        type: 'credit',
        reference: {
          kind: 'withdrawal',
          id: existing._id,
        },
        description: `Hoàn tiền yêu cầu rút tiền bị từ chối (${refundCode}): ${input.notes ?? ''}`.trim(),
      });
    }

    // 2. Cập nhật trạng thái nguyên tử chỉ khi status còn là 'pending'
    const processedAt = new Date();
    const updated = await this.withdrawalRepository.atomicProcessPending(withdrawalId, {
      status: targetStatus,
      processedBy: adminId,
      processedAt,
      notes: input.notes,
    });

    if (!updated) {
      throw new AppError(
        400,
        'WITHDRAWAL_ALREADY_PROCESSED',
        'Yêu cầu rút tiền đã được xử lý bởi quản trị viên khác.',
      );
    }

    // 3. Gửi thông báo đến người dùng (Notification)
    const formattedAmount = existing.amount.toLocaleString('vi-VN');
    if (targetStatus === 'completed') {
      await this.notificationRepository.create({
        userId: existing.userId,
        title: 'Yêu cầu rút tiền thành công',
        body: `Số tiền ${formattedAmount} VNĐ đã được chuyển về tài khoản ngân hàng ${existing.bankInfo.bankName} (${existing.bankInfo.accountNumber}).`,
        type: 'withdrawal_completed',
      });
    } else {
      await this.notificationRepository.create({
        userId: existing.userId,
        title: 'Yêu cầu rút tiền bị từ chối',
        body: `Yêu cầu rút ${formattedAmount} VNĐ đã bị từ chối. Lý do: ${input.notes || 'Không hợp lệ'}. Số dư đã được hoàn lại vào ví của bạn.`,
        type: 'withdrawal_rejected',
      });
    }

    return this.mapAdminWithdrawalToDto(updated);
  }
}



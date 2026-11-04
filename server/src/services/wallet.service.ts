import mongoose from 'mongoose';
import type { IWallet } from '../models/wallet.model.js';
import type { IWalletTransaction } from '../models/wallet-transaction.model.js';
import { WalletRepository } from '../repositories/wallet.repository.js';
import { WalletTransactionRepository } from '../repositories/wallet-transaction.repository.js';
import type {
  PaginatedTransactionsDto,
  WalletDto,
  WalletTransactionDto,
} from '../types/wallet.types.js';
import { AppError } from '../utils/app-error.js';

export class WalletService {
  public constructor(
    private readonly walletRepository: WalletRepository = new WalletRepository(),
    private readonly transactionRepository: WalletTransactionRepository = new WalletTransactionRepository(),
  ) {}

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
}

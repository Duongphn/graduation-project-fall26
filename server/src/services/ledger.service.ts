import mongoose, { type ClientSession, type Types } from 'mongoose';
import type { IWallet } from '../models/wallet.model.js';
import type { IWalletTransaction } from '../models/wallet-transaction.model.js';
import { WalletRepository } from '../repositories/wallet.repository.js';
import { WalletTransactionRepository } from '../repositories/wallet-transaction.repository.js';
import type {
  EscrowDistributionInput,
  LedgerResult,
  LedgerSingleEntryInput,
  LedgerTransferInput,
  WalletTransactionDto,
} from '../types/wallet.types.js';
import { AppError } from '../utils/app-error.js';

export class LedgerService {
  public constructor(
    private readonly walletRepository: WalletRepository = new WalletRepository(),
    private readonly transactionRepository: WalletTransactionRepository = new WalletTransactionRepository(),
  ) {}

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

  private buildEntry(data: {
    walletId: Types.ObjectId | string;
    entryKey: string;
    postingKey: string;
    amount: number;
    type: 'credit' | 'debit';
    balanceBefore?: number | undefined;
    balanceAfter?: number | undefined;
    reference?: { kind: string; id: Types.ObjectId | string } | undefined;
    description?: string | undefined;
  }): Partial<IWalletTransaction> {
    const entry: Partial<IWalletTransaction> = {
      walletId: new mongoose.Types.ObjectId(data.walletId.toString()),
      entryKey: data.entryKey,
      postingKey: data.postingKey,
      amount: data.amount,
      type: data.type,
    };

    if (data.balanceBefore !== undefined) {
      entry.balanceBefore = data.balanceBefore;
    }
    if (data.balanceAfter !== undefined) {
      entry.balanceAfter = data.balanceAfter;
    }
    if (data.reference) {
      entry.reference = {
        kind: data.reference.kind,
        id: new mongoose.Types.ObjectId(data.reference.id.toString()),
      };
    }
    if (data.description !== undefined) {
      entry.description = data.description;
    }

    return entry;
  }

  private async executeWithTransaction<T>(
    work: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    if (mongoose.connection.readyState !== 1) {
      return work(undefined);
    }

    let session: ClientSession | undefined;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch {
      // Standalone MongoDB without replica set fallback (e.g., local mock or single test node)
      session = undefined;
    }


    if (session) {
      try {
        const result = await work(session);
        await session.commitTransaction();
        return result;
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        await session.endSession();
      }
    }

    return work(undefined);
  }

  /**
   * Chuyển tiền giữa 2 ví với tính nguyên tử (Atomic Double-Entry Transfer)
   * Kèm cơ chế Idempotency dựa trên postingKey.
   */
  public async transfer(input: LedgerTransferInput): Promise<LedgerResult> {
    if (!input.postingKey || !input.postingKey.trim()) {
      throw new AppError(400, 'INVALID_INPUT', 'postingKey (Idempotency key) is required.');
    }
    if (input.amount <= 0 || !Number.isInteger(input.amount)) {
      throw new AppError(400, 'INVALID_INPUT', 'Transfer amount must be a positive integer.');
    }
    if (input.fromWalletId.toString() === input.toWalletId.toString()) {
      throw new AppError(400, 'INVALID_INPUT', 'Source and destination wallets must be different.');
    }

    return this.executeWithTransaction(async (session) => {
      // 1. Kiểm tra Idempotency
      const existing = await this.transactionRepository.findByPostingKey(
        input.postingKey,
        session,
      );
      if (existing.length > 0) {
        return {
          postingKey: input.postingKey,
          idempotentReplay: true,
          transactions: existing.map((tx) => this.mapTransactionToDto(tx)),
        };
      }

      // 2. Trừ tiền ví nguồn (Debit)
      const debitUpdate = await this.walletRepository.updateBalanceAtomic(
        input.fromWalletId,
        -input.amount,
        session,
      );
      if (!debitUpdate) {
        const sourceWallet = await this.walletRepository.findById(input.fromWalletId, session);
        if (!sourceWallet) {
          throw new AppError(404, 'WALLET_NOT_FOUND', 'Source wallet not found.');
        }
        if (sourceWallet.status !== 'active') {
          throw new AppError(400, 'WALLET_INACTIVE', 'Source wallet is not active.');
        }
        throw new AppError(
          400,
          'INSUFFICIENT_BALANCE',
          'Số dư ví không đủ để thực hiện giao dịch.',
        );
      }

      // 3. Cộng tiền ví đích (Credit)
      const creditUpdate = await this.walletRepository.updateBalanceAtomic(
        input.toWalletId,
        input.amount,
        session,
      );
      if (!creditUpdate) {
        throw new AppError(404, 'WALLET_NOT_FOUND', 'Destination wallet not found or not active.');
      }

      // 4. Ghi 2 bút toán sổ cái (Double-Entry)
      const debitEntry = this.buildEntry({
        walletId: input.fromWalletId,
        entryKey: `${input.postingKey}_debit`,
        postingKey: input.postingKey,
        amount: input.amount,
        type: 'debit',
        balanceBefore: debitUpdate.previousBalance,
        balanceAfter: debitUpdate.newBalance,
        reference: input.reference,
        description: input.description ?? 'Transfer debit',
      });

      const creditEntry = this.buildEntry({
        walletId: input.toWalletId,
        entryKey: `${input.postingKey}_credit`,
        postingKey: input.postingKey,
        amount: input.amount,
        type: 'credit',
        balanceBefore: creditUpdate.previousBalance,
        balanceAfter: creditUpdate.newBalance,
        reference: input.reference,
        description: input.description ?? 'Transfer credit',
      });

      const createdEntries = await this.transactionRepository.createEntries(
        [debitEntry, creditEntry],
        session,
      );

      return {
        postingKey: input.postingKey,
        idempotentReplay: false,
        transactions: createdEntries.map((tx) => this.mapTransactionToDto(tx)),
      };
    });
  }

  /**
   * Ghi 1 bút toán đơn vào 1 ví (Nạp tiền từ cổng thanh toán / Khấu trừ phạt trực tiếp)
   */
  public async recordSingleEntry(input: LedgerSingleEntryInput): Promise<LedgerResult> {
    if (!input.postingKey || !input.postingKey.trim()) {
      throw new AppError(400, 'INVALID_INPUT', 'postingKey (Idempotency key) is required.');
    }
    if (input.amount <= 0 || !Number.isInteger(input.amount)) {
      throw new AppError(400, 'INVALID_INPUT', 'Amount must be a positive integer.');
    }

    return this.executeWithTransaction(async (session) => {
      const existing = await this.transactionRepository.findByPostingKey(
        input.postingKey,
        session,
      );
      if (existing.length > 0) {
        return {
          postingKey: input.postingKey,
          idempotentReplay: true,
          transactions: existing.map((tx) => this.mapTransactionToDto(tx)),
        };
      }

      const delta = input.type === 'debit' ? -input.amount : input.amount;
      const updateResult = await this.walletRepository.updateBalanceAtomic(
        input.walletId,
        delta,
        session,
      );

      if (!updateResult) {
        if (input.type === 'debit') {
          throw new AppError(
            400,
            'INSUFFICIENT_BALANCE',
            'Số dư ví không đủ để thực hiện giao dịch.',
          );
        }
        throw new AppError(404, 'WALLET_NOT_FOUND', 'Wallet not found or not active.');
      }

      const suffix = input.entryKeySuffix ?? input.type;
      const entry = this.buildEntry({
        walletId: input.walletId,
        entryKey: `${input.postingKey}_${suffix}`,
        postingKey: input.postingKey,
        amount: input.amount,
        type: input.type,
        balanceBefore: updateResult.previousBalance,
        balanceAfter: updateResult.newBalance,
        reference: input.reference,
        description: input.description,
      });

      const created = await this.transactionRepository.createEntries([entry], session);

      return {
        postingKey: input.postingKey,
        idempotentReplay: false,
        transactions: created.map((tx) => this.mapTransactionToDto(tx)),
      };
    });
  }

  /**
   * Phân bổ tiền tạm giữ (Escrow Settlement):
   * Trừ tổng tiền khỏi Escrow -> Phân bổ cho Bên thụ hưởng (Người bán/Chủ đồ) + Sàn thu phí (Platform Fee) + Hoàn cọc (nếu có)
   */
  public async distributeEscrow(input: EscrowDistributionInput): Promise<LedgerResult> {
    if (!input.postingKey || !input.postingKey.trim()) {
      throw new AppError(400, 'INVALID_INPUT', 'postingKey is required.');
    }
    if (input.beneficiaryAmount < 0 || input.platformFeeAmount < 0) {
      throw new AppError(400, 'INVALID_INPUT', 'Amounts must be non-negative.');
    }

    const refundAmount = input.refundAmount ?? 0;
    const totalDeduction = input.beneficiaryAmount + input.platformFeeAmount + refundAmount;
    if (totalDeduction <= 0) {
      throw new AppError(400, 'INVALID_INPUT', 'Total distribution amount must be positive.');
    }

    return this.executeWithTransaction(async (session) => {
      // 1. Kiểm tra Idempotency
      const existing = await this.transactionRepository.findByPostingKey(
        input.postingKey,
        session,
      );
      if (existing.length > 0) {
        return {
          postingKey: input.postingKey,
          idempotentReplay: true,
          transactions: existing.map((tx) => this.mapTransactionToDto(tx)),
        };
      }

      // 2. Lấy ví Escrow và ví Phí sàn (nếu không truyền id cụ thể thì lấy tài khoản hệ thống)
      let escrowWallet: IWallet;
      if (input.escrowWalletId) {
        const found = await this.walletRepository.findById(input.escrowWalletId, session);
        if (!found) {
          throw new AppError(404, 'WALLET_NOT_FOUND', 'Escrow wallet not found.');
        }
        escrowWallet = found;
      } else {
        escrowWallet = await this.walletRepository.getOrCreateSystemWallet('escrow', session);
      }

      let platformFeeWallet: IWallet;
      if (input.platformFeeWalletId) {
        const found = await this.walletRepository.findById(input.platformFeeWalletId, session);
        if (!found) {
          throw new AppError(404, 'WALLET_NOT_FOUND', 'Platform fee wallet not found.');
        }
        platformFeeWallet = found;
      } else {
        platformFeeWallet = await this.walletRepository.getOrCreateSystemWallet(
          'platform_fee',
          session,
        );
      }

      // 3. Trừ tiền khỏi ví Escrow
      const escrowDebit = await this.walletRepository.updateBalanceAtomic(
        escrowWallet._id,
        -totalDeduction,
        session,
      );
      if (!escrowDebit) {
        throw new AppError(
          400,
          'INSUFFICIENT_ESCROW_BALANCE',
          'Số dư tài khoản tạm giữ (Escrow) không đủ để phân bổ.',
        );
      }

      const entriesToCreate: Array<Partial<IWalletTransaction>> = [];

      // Bản ghi trừ tiền Escrow
      entriesToCreate.push(
        this.buildEntry({
          walletId: escrowWallet._id,
          entryKey: `${input.postingKey}_escrow_debit`,
          postingKey: input.postingKey,
          amount: totalDeduction,
          type: 'debit',
          balanceBefore: escrowDebit.previousBalance,
          balanceAfter: escrowDebit.newBalance,
          reference: input.reference,
          description: input.description ?? 'Escrow release debit',
        }),
      );

      // 4. Cộng tiền cho Người bán / Chủ đồ (Beneficiary)
      if (input.beneficiaryAmount > 0) {
        const beneficiaryCredit = await this.walletRepository.updateBalanceAtomic(
          input.beneficiaryWalletId,
          input.beneficiaryAmount,
          session,
        );
        if (!beneficiaryCredit) {
          throw new AppError(
            404,
            'WALLET_NOT_FOUND',
            'Beneficiary wallet not found or inactive.',
          );
        }
        entriesToCreate.push(
          this.buildEntry({
            walletId: input.beneficiaryWalletId,
            entryKey: `${input.postingKey}_beneficiary_credit`,
            postingKey: input.postingKey,
            amount: input.beneficiaryAmount,
            type: 'credit',
            balanceBefore: beneficiaryCredit.previousBalance,
            balanceAfter: beneficiaryCredit.newBalance,
            reference: input.reference,
            description: input.description ?? 'Order settlement earnings',
          }),
        );
      }

      // 5. Cộng tiền cho Phí sàn (Platform Fee)
      if (input.platformFeeAmount > 0) {
        const platformCredit = await this.walletRepository.updateBalanceAtomic(
          platformFeeWallet._id,
          input.platformFeeAmount,
          session,
        );
        if (!platformCredit) {
          throw new AppError(404, 'WALLET_NOT_FOUND', 'Platform fee wallet not active.');
        }
        entriesToCreate.push(
          this.buildEntry({
            walletId: platformFeeWallet._id,
            entryKey: `${input.postingKey}_platform_fee_credit`,
            postingKey: input.postingKey,
            amount: input.platformFeeAmount,
            type: 'credit',
            balanceBefore: platformCredit.previousBalance,
            balanceAfter: platformCredit.newBalance,
            reference: input.reference,
            description: input.description ?? 'Platform service fee cut',
          }),
        );
      }

      // 6. Hoàn trả người thuê / người mua (nếu có hoàn tiền/cọc)
      if (refundAmount > 0 && input.refundWalletId) {
        const refundCredit = await this.walletRepository.updateBalanceAtomic(
          input.refundWalletId,
          refundAmount,
          session,
        );
        if (!refundCredit) {
          throw new AppError(404, 'WALLET_NOT_FOUND', 'Refund recipient wallet not active.');
        }
        entriesToCreate.push(
          this.buildEntry({
            walletId: input.refundWalletId,
            entryKey: `${input.postingKey}_refund_credit`,
            postingKey: input.postingKey,
            amount: refundAmount,
            type: 'credit',
            balanceBefore: refundCredit.previousBalance,
            balanceAfter: refundCredit.newBalance,
            reference: input.reference,
            description: input.description ?? 'Escrow refund/deposit return',
          }),
        );
      }

      const createdEntries = await this.transactionRepository.createEntries(
        entriesToCreate,
        session,
      );

      return {
        postingKey: input.postingKey,
        idempotentReplay: false,
        transactions: createdEntries.map((tx) => this.mapTransactionToDto(tx)),
      };
    });
  }

  public async getSystemWallet(
    ownerType: 'escrow' | 'platform_fee' | 'platform',
  ): Promise<IWallet> {
    return this.walletRepository.getOrCreateSystemWallet(ownerType);
  }
}

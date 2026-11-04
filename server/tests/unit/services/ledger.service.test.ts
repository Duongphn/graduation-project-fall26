import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IWallet } from '../../../src/models/wallet.model.js';
import type { IWalletTransaction } from '../../../src/models/wallet-transaction.model.js';
import type { WalletRepository } from '../../../src/repositories/wallet.repository.js';
import type { WalletTransactionRepository } from '../../../src/repositories/wallet-transaction.repository.js';
import { LedgerService } from '../../../src/services/ledger.service.js';
import { AppError } from '../../../src/utils/app-error.js';

describe('LedgerService (Shared Ledger & Idempotency)', () => {
  let mockWalletRepo: Partial<Record<keyof WalletRepository, ReturnType<typeof vi.fn>>>;
  let mockTxRepo: Partial<Record<keyof WalletTransactionRepository, ReturnType<typeof vi.fn>>>;
  let ledgerService: LedgerService;

  beforeEach(() => {
    mockWalletRepo = {
      findById: vi.fn(),
      findByUserId: vi.fn(),
      findSystemWallet: vi.fn(),
      getOrCreateUserWallet: vi.fn(),
      getOrCreateSystemWallet: vi.fn(),
      updateBalanceAtomic: vi.fn(),
    };

    mockTxRepo = {
      findByPostingKey: vi.fn(),
      findByEntryKey: vi.fn(),
      createEntries: vi.fn(),
      listByWalletId: vi.fn(),
    };

    ledgerService = new LedgerService(
      mockWalletRepo as unknown as WalletRepository,
      mockTxRepo as unknown as WalletTransactionRepository,
    );
  });

  describe('transfer', () => {
    const fromWalletId = new mongoose.Types.ObjectId();
    const toWalletId = new mongoose.Types.ObjectId();
    const postingKey = 'TX_TRANSFER_1001';

    it('successfully executes atomic double-entry transfer and creates debit + credit entries', async () => {
      mockTxRepo.findByPostingKey!.mockResolvedValue([]);

      mockWalletRepo.updateBalanceAtomic!
        .mockResolvedValueOnce({
          wallet: { _id: fromWalletId, balance: 400000, status: 'active' } as unknown as IWallet,
          previousBalance: 500000,
          newBalance: 400000,
        })
        .mockResolvedValueOnce({
          wallet: { _id: toWalletId, balance: 100000, status: 'active' } as unknown as IWallet,
          previousBalance: 0,
          newBalance: 100000,
        });

      mockTxRepo.createEntries!.mockImplementation(async (entries: unknown[]) => {
        return entries.map((entry, _idx) => ({
          ...(entry as Record<string, unknown>),
          _id: new mongoose.Types.ObjectId(),
          createdAt: new Date(),
        })) as unknown as IWalletTransaction[];
      });

      const result = await ledgerService.transfer({
        postingKey,
        fromWalletId,
        toWalletId,
        amount: 100000,
        description: 'Rental deposit transfer',
      });

      expect(result.idempotentReplay).toBe(false);
      expect(result.postingKey).toBe(postingKey);
      expect(result.transactions).toHaveLength(2);

      const debitTx = result.transactions.find((t) => t.type === 'debit');
      const creditTx = result.transactions.find((t) => t.type === 'credit');

      expect(debitTx?.amount).toBe(100000);
      expect(debitTx?.balanceBefore).toBe(500000);
      expect(debitTx?.balanceAfter).toBe(400000);
      expect(debitTx?.entryKey).toBe(`${postingKey}_debit`);

      expect(creditTx?.amount).toBe(100000);
      expect(creditTx?.balanceBefore).toBe(0);
      expect(creditTx?.balanceAfter).toBe(100000);
      expect(creditTx?.entryKey).toBe(`${postingKey}_credit`);
    });

    it('returns existing transaction records when postingKey is replayed (Idempotency)', async () => {
      const existingTx = [
        {
          _id: new mongoose.Types.ObjectId(),
          walletId: fromWalletId,
          entryKey: `${postingKey}_debit`,
          postingKey,
          amount: 50000,
          type: 'debit',
          balanceBefore: 200000,
          balanceAfter: 150000,
          createdAt: new Date(),
        },
      ] as unknown as IWalletTransaction[];

      mockTxRepo.findByPostingKey!.mockResolvedValue(existingTx);

      const result = await ledgerService.transfer({
        postingKey,
        fromWalletId,
        toWalletId,
        amount: 50000,
      });

      expect(result.idempotentReplay).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]?.entryKey).toBe(`${postingKey}_debit`);
      // Crucial: wallet balances are NOT touched on replay!
      expect(mockWalletRepo.updateBalanceAtomic).not.toHaveBeenCalled();
    });

    it('throws INSUFFICIENT_BALANCE when source wallet has insufficient balance', async () => {
      mockTxRepo.findByPostingKey!.mockResolvedValue([]);
      // Source wallet cannot satisfy balance condition
      mockWalletRepo.updateBalanceAtomic!.mockResolvedValueOnce(null);
      mockWalletRepo.findById!.mockResolvedValueOnce({
        _id: fromWalletId,
        balance: 30000,
        status: 'active',
      } as unknown as IWallet);

      await expect(
        ledgerService.transfer({
          postingKey,
          fromWalletId,
          toWalletId,
          amount: 100000,
        }),
      ).rejects.toThrow(AppError);

      expect(mockWalletRepo.updateBalanceAtomic).toHaveBeenCalledTimes(1);
      expect(mockTxRepo.createEntries).not.toHaveBeenCalled();
    });

    it('rejects transfer when from and to wallets are identical', async () => {
      await expect(
        ledgerService.transfer({
          postingKey,
          fromWalletId,
          toWalletId: fromWalletId,
          amount: 50000,
        }),
      ).rejects.toThrow('Source and destination wallets must be different.');
    });

    it('rejects transfer when amount is not a positive integer', async () => {
      await expect(
        ledgerService.transfer({
          postingKey,
          fromWalletId,
          toWalletId,
          amount: -500,
        }),
      ).rejects.toThrow('Transfer amount must be a positive integer.');
    });
  });

  describe('recordSingleEntry', () => {
    const walletId = new mongoose.Types.ObjectId();
    const postingKey = 'TX_TOPUP_2001';

    it('successfully credits a wallet (e.g. payment gateway deposit)', async () => {
      mockTxRepo.findByPostingKey!.mockResolvedValue([]);
      mockWalletRepo.updateBalanceAtomic!.mockResolvedValue({
        wallet: { _id: walletId, balance: 250000 } as unknown as IWallet,
        previousBalance: 50000,
        newBalance: 250000,
      });

      mockTxRepo.createEntries!.mockImplementation(async (entries: unknown[]) => {
        return entries.map((e) => ({
          ...(e as Record<string, unknown>),
          _id: new mongoose.Types.ObjectId(),
          createdAt: new Date(),
        })) as unknown as IWalletTransaction[];
      });

      const result = await ledgerService.recordSingleEntry({
        postingKey,
        walletId,
        amount: 200000,
        type: 'credit',
        description: 'MoMo topup',
      });

      expect(result.idempotentReplay).toBe(false);
      expect(result.transactions[0]?.type).toBe('credit');
      expect(result.transactions[0]?.amount).toBe(200000);
      expect(result.transactions[0]?.balanceBefore).toBe(50000);
      expect(result.transactions[0]?.balanceAfter).toBe(250000);
      expect(result.transactions[0]?.entryKey).toBe(`${postingKey}_credit`);
    });
  });

  describe('distributeEscrow (Escrow Settlement)', () => {
    const escrowWalletId = new mongoose.Types.ObjectId();
    const beneficiaryWalletId = new mongoose.Types.ObjectId();
    const platformFeeWalletId = new mongoose.Types.ObjectId();
    const refundWalletId = new mongoose.Types.ObjectId();
    const postingKey = 'ESCROW_SETTLE_ORDER_99';

    it('settles escrow to beneficiary, platform fee, and deposit refund', async () => {
      mockTxRepo.findByPostingKey!.mockResolvedValue([]);

      mockWalletRepo.findById!
        .mockResolvedValueOnce({ _id: escrowWalletId, status: 'active' } as unknown as IWallet)
        .mockResolvedValueOnce({ _id: platformFeeWalletId, status: 'active' } as unknown as IWallet);

      // 1. Escrow deduction: total = 80000 (seller) + 20000 (fee) + 500000 (refund) = 600000
      mockWalletRepo.updateBalanceAtomic!
        .mockResolvedValueOnce({
          wallet: { _id: escrowWalletId, balance: 400000 } as unknown as IWallet,
          previousBalance: 1000000,
          newBalance: 400000,
        })
        // 2. Beneficiary credit
        .mockResolvedValueOnce({
          wallet: { _id: beneficiaryWalletId, balance: 80000 } as unknown as IWallet,
          previousBalance: 0,
          newBalance: 80000,
        })
        // 3. Platform fee credit
        .mockResolvedValueOnce({
          wallet: { _id: platformFeeWalletId, balance: 20000 } as unknown as IWallet,
          previousBalance: 0,
          newBalance: 20000,
        })
        // 4. Refund credit
        .mockResolvedValueOnce({
          wallet: { _id: refundWalletId, balance: 500000 } as unknown as IWallet,
          previousBalance: 0,
          newBalance: 500000,
        });

      mockTxRepo.createEntries!.mockImplementation(async (entries: unknown[]) => {
        return entries.map((e) => ({
          ...(e as Record<string, unknown>),
          _id: new mongoose.Types.ObjectId(),
          createdAt: new Date(),
        })) as unknown as IWalletTransaction[];
      });

      const result = await ledgerService.distributeEscrow({
        postingKey,
        escrowWalletId,
        beneficiaryWalletId,
        beneficiaryAmount: 80000,
        platformFeeWalletId,
        platformFeeAmount: 20000,
        refundWalletId,
        refundAmount: 500000,
        description: 'Complete rental order #99 settlement',
      });

      expect(result.idempotentReplay).toBe(false);
      expect(result.transactions).toHaveLength(4);

      const escrowEntry = result.transactions.find((t) => t.entryKey.includes('escrow_debit'));
      const beneficiaryEntry = result.transactions.find((t) => t.entryKey.includes('beneficiary_credit'));
      const feeEntry = result.transactions.find((t) => t.entryKey.includes('platform_fee_credit'));
      const refundEntry = result.transactions.find((t) => t.entryKey.includes('refund_credit'));

      expect(escrowEntry?.amount).toBe(600000);
      expect(escrowEntry?.type).toBe('debit');
      expect(beneficiaryEntry?.amount).toBe(80000);
      expect(beneficiaryEntry?.type).toBe('credit');
      expect(feeEntry?.amount).toBe(20000);
      expect(refundEntry?.amount).toBe(500000);
    });

    it('throws INSUFFICIENT_ESCROW_BALANCE if escrow balance cannot cover settlement', async () => {
      mockTxRepo.findByPostingKey!.mockResolvedValue([]);
      mockWalletRepo.findById!
        .mockResolvedValueOnce({ _id: escrowWalletId, status: 'active' } as unknown as IWallet)
        .mockResolvedValueOnce({ _id: platformFeeWalletId, status: 'active' } as unknown as IWallet);

      mockWalletRepo.updateBalanceAtomic!.mockResolvedValueOnce(null);

      await expect(
        ledgerService.distributeEscrow({
          postingKey,
          escrowWalletId,
          beneficiaryWalletId,
          beneficiaryAmount: 80000,
          platformFeeWalletId,
          platformFeeAmount: 20000,
        }),
      ).rejects.toThrow('Số dư tài khoản tạm giữ (Escrow) không đủ để phân bổ.');
    });
  });
});

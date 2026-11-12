import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../src/config/env.js';
import { WalletController } from '../src/controllers/wallet.controller.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { createWalletRouter } from '../src/routes/wallet.routes.js';
import { authenticate } from '../src/middlewares/authenticate.js';
import { WalletService } from '../src/services/wallet.service.js';
import type { WalletRepository } from '../src/repositories/wallet.repository.js';
import type { WalletTransactionRepository } from '../src/repositories/wallet-transaction.repository.js';
import type { WithdrawalRepository } from '../src/repositories/withdrawal.repository.js';
import type { LedgerService } from '../src/services/ledger.service.js';
import type { IWallet } from '../src/models/wallet.model.js';
import type { IWithdrawalRequest } from '../src/models/withdrawal-request.model.js';

function createToken(payload: { userId: string; role: 'USER' | 'ADMIN' }): string {
  return jwt.sign(payload, env.jwtAccessSecret);
}

describe('Wallet Withdrawal APIs (/api/v1/wallets/withdrawals & /withdraw)', () => {
  const validUserId = new mongoose.Types.ObjectId().toString();
  const mockWalletId = new mongoose.Types.ObjectId();

  let mockWalletRepo: Partial<Record<keyof WalletRepository, ReturnType<typeof vi.fn>>>;
  let mockTxRepo: Partial<Record<keyof WalletTransactionRepository, ReturnType<typeof vi.fn>>>;
  let mockWithdrawalRepo: Partial<Record<keyof WithdrawalRepository, ReturnType<typeof vi.fn>>>;
  let mockLedgerService: Partial<Record<keyof LedgerService, ReturnType<typeof vi.fn>>>;
  let walletService: WalletService;
  let walletController: WalletController;
  let app: express.Express;

  beforeEach(() => {
    mockWalletRepo = {
      getOrCreateUserWallet: vi.fn().mockResolvedValue({
        _id: mockWalletId,
        userId: new mongoose.Types.ObjectId(validUserId),
        ownerType: 'user',
        balance: 1000000, // 1 triệu VNĐ
        currency: 'VND',
        status: 'active',
      } as unknown as IWallet),
    };

    mockTxRepo = {
      createEntries: vi.fn(),
      findByPostingKey: vi.fn(),
    };

    mockWithdrawalRepo = {
      findPendingByUserId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async (data: Partial<IWithdrawalRequest>) => ({
        _id: data._id ?? new mongoose.Types.ObjectId(),
        code: data.code ?? 'WD_MOCK_123',
        userId: data.userId,
        amount: data.amount,
        bankInfo: data.bankInfo,
        status: data.status ?? 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      listByUserId: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    mockLedgerService = {
      recordSingleEntry: vi.fn().mockResolvedValue({
        postingKey: 'withdrawal_WD_MOCK_123',
        idempotentReplay: false,
        transactions: [],
      }),
    };

    walletService = new WalletService(
      mockWalletRepo as unknown as WalletRepository,
      mockTxRepo as unknown as WalletTransactionRepository,
      mockWithdrawalRepo as unknown as WithdrawalRepository,
      mockLedgerService as unknown as LedgerService,
    );

    walletController = new WalletController(walletService);

    app = express();
    app.use(express.json());
    app.use('/api/v1/wallets', authenticate, createWalletRouter(walletService, walletController));
    app.use(errorHandler);
  });

  describe('POST /api/v1/wallets/withdrawals', () => {
    const validBody = {
      amount: 200000,
      bankInfo: {
        bankName: 'Vietcombank',
        accountNumber: '0123456789',
        accountHolderName: 'nguyen van a',
      },
    };

    it('denies unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request(app).post('/api/v1/wallets/withdrawals').send(validBody);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects withdrawal amount less than MIN_AMOUNT (50,000 VND) with 400 VALIDATION_ERROR', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .post('/api/v1/wallets/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBody,
          amount: 30000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('50.000');
    });

    it('rejects withdrawal amount greater than MAX_AMOUNT (20,000,000 VND) with 400 VALIDATION_ERROR', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .post('/api/v1/wallets/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBody,
          amount: 25000000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('20.000.000');
    });

    it('rejects non-integer amount with 400 VALIDATION_ERROR', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .post('/api/v1/wallets/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBody,
          amount: 100000.5,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid bank account number (contains letters or symbols) with 400 VALIDATION_ERROR', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .post('/api/v1/wallets/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBody,
          bankInfo: {
            ...validBody.bankInfo,
            accountNumber: '123ABC456',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Số tài khoản');
    });

    it('rejects when user already has a pending withdrawal request with 400 PENDING_WITHDRAWAL_EXISTS', async () => {
      mockWithdrawalRepo.findPendingByUserId!.mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        status: 'pending',
        amount: 100000,
      } as unknown as IWithdrawalRequest);

      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .post('/api/v1/wallets/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PENDING_WITHDRAWAL_EXISTS');
      expect(res.body.error.message).toContain('chờ xử lý');
      expect(mockLedgerService.recordSingleEntry).not.toHaveBeenCalled();
    });

    it('rejects when wallet balance is insufficient with 400 INSUFFICIENT_BALANCE', async () => {
      mockWalletRepo.getOrCreateUserWallet!.mockResolvedValueOnce({
        _id: mockWalletId,
        balance: 100000, // Chỉ có 100k
        status: 'active',
      } as unknown as IWallet);

      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .post('/api/v1/wallets/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...validBody,
          amount: 200000, // Muốn rút 200k
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
      expect(mockLedgerService.recordSingleEntry).not.toHaveBeenCalled();
    });

    it('rejects when wallet is inactive with 400 WALLET_INACTIVE', async () => {
      mockWalletRepo.getOrCreateUserWallet!.mockResolvedValueOnce({
        _id: mockWalletId,
        balance: 1000000,
        status: 'frozen',
      } as unknown as IWallet);

      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .post('/api/v1/wallets/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('WALLET_INACTIVE');
      expect(mockLedgerService.recordSingleEntry).not.toHaveBeenCalled();
    });

    it('successfully creates pending withdrawal request, temporarily deducts balance, and normalizes account name', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .post('/api/v1/wallets/withdrawals')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amount).toBe(200000);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.bankInfo.bankName).toBe('Vietcombank');
      expect(res.body.data.bankInfo.accountNumber).toBe('0123456789');
      expect(res.body.data.bankInfo.accountHolderName).toBe('NGUYEN VAN A'); // Viết hoa chuẩn hóa
      expect(res.body.data.code).toMatch(/^WD_\d+_\d+$/);

      // Kiểm tra việc tạm trừ số dư qua LedgerService
      expect(mockLedgerService.recordSingleEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: mockWalletId,
          amount: 200000,
          type: 'debit',
          reference: expect.objectContaining({
            kind: 'withdrawal',
          }),
        }),
      );

      // Kiểm tra việc tạo bản ghi WithdrawalRequest
      expect(mockWithdrawalRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 200000,
          status: 'pending',
          bankInfo: expect.objectContaining({
            accountHolderName: 'NGUYEN VAN A',
          }),
        }),
      );
    });

    it('also works with route alias POST /api/v1/wallets/withdraw', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .post('/api/v1/wallets/withdraw')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('pending');
    });
  });

  describe('GET /api/v1/wallets/withdrawals', () => {
    it('denies unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/wallets/withdrawals');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns paginated withdrawal requests for authenticated user', async () => {
      const mockItem = {
        _id: new mongoose.Types.ObjectId(),
        code: 'WD_1001',
        userId: new mongoose.Types.ObjectId(validUserId),
        amount: 200000,
        bankInfo: {
          bankName: 'MBBank',
          accountNumber: '987654321',
          accountHolderName: 'TRAN VAN B',
        },
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockWithdrawalRepo.listByUserId!.mockResolvedValueOnce({
        items: [mockItem as unknown as IWithdrawalRequest],
        total: 1,
      });

      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .get('/api/v1/wallets/withdrawals')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].code).toBe('WD_1001');
      expect(res.body.data.items[0].amount).toBe(200000);
      expect(res.body.data.total).toBe(1);
    });
  });
});

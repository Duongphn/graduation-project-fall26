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
import type { NotificationRepository } from '../src/repositories/notification.repository.js';
import type { LedgerService } from '../src/services/ledger.service.js';
import type { IWallet } from '../src/models/wallet.model.js';
import type { IWithdrawalRequest } from '../src/models/withdrawal-request.model.js';

function createToken(payload: { userId: string; role: 'USER' | 'ADMIN' }): string {
  return jwt.sign(payload, env.jwtAccessSecret);
}

describe('Admin Withdrawal Processing APIs (/api/v1/wallets/admin/withdrawals)', () => {
  const validAdminId = new mongoose.Types.ObjectId().toString();
  const validUserId = new mongoose.Types.ObjectId().toString();
  const mockWalletId = new mongoose.Types.ObjectId();
  const mockWithdrawalId = new mongoose.Types.ObjectId().toString();

  let mockWalletRepo: Partial<Record<keyof WalletRepository, ReturnType<typeof vi.fn>>>;
  let mockTxRepo: Partial<Record<keyof WalletTransactionRepository, ReturnType<typeof vi.fn>>>;
  let mockWithdrawalRepo: Partial<Record<keyof WithdrawalRepository, ReturnType<typeof vi.fn>>>;
  let mockNotifRepo: Partial<Record<keyof NotificationRepository, ReturnType<typeof vi.fn>>>;
  let mockLedgerService: Partial<Record<keyof LedgerService, ReturnType<typeof vi.fn>>>;
  let walletService: WalletService;
  let walletController: WalletController;
  let app: express.Express;

  beforeEach(() => {
    mockWalletRepo = {
      findByUserId: vi.fn().mockResolvedValue({
        _id: mockWalletId,
        userId: new mongoose.Types.ObjectId(validUserId),
        ownerType: 'user',
        balance: 500000,
        currency: 'VND',
        status: 'active',
      } as unknown as IWallet),
    };

    mockTxRepo = {
      createEntries: vi.fn(),
      findByPostingKey: vi.fn(),
    };

    mockWithdrawalRepo = {
      findById: vi.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(mockWithdrawalId),
        code: 'WD_MOCK_888',
        userId: new mongoose.Types.ObjectId(validUserId),
        amount: 200000,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'NGUYEN VAN A',
        },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as IWithdrawalRequest),
      listForAdmin: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      atomicProcessPending: vi.fn().mockImplementation(async (id, updateData) => ({
        _id: new mongoose.Types.ObjectId(id.toString()),
        code: 'WD_MOCK_888',
        userId: new mongoose.Types.ObjectId(validUserId),
        amount: 200000,
        bankInfo: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolderName: 'NGUYEN VAN A',
        },
        status: updateData.status,
        processedBy: updateData.processedBy,
        processedAt: updateData.processedAt ?? new Date(),
        notes: updateData.notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    };

    mockNotifRepo = {
      create: vi.fn().mockResolvedValue({}),
    };

    mockLedgerService = {
      recordSingleEntry: vi.fn().mockResolvedValue({
        postingKey: 'refund_rejected_wd_WD_MOCK_888',
        idempotentReplay: false,
        transactions: [],
      }),
    };

    walletService = new WalletService(
      mockWalletRepo as unknown as WalletRepository,
      mockTxRepo as unknown as WalletTransactionRepository,
      mockWithdrawalRepo as unknown as WithdrawalRepository,
      mockLedgerService as unknown as LedgerService,
      mockNotifRepo as unknown as NotificationRepository,
    );

    walletController = new WalletController(walletService);

    app = express();
    app.use(express.json());
    app.use('/api/v1/wallets', authenticate, createWalletRouter(walletService, walletController));
    app.use(errorHandler);
  });

  describe('GET /api/v1/wallets/admin/withdrawals', () => {
    it('denies unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/wallets/admin/withdrawals');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('denies non-admin USER with 403 FORBIDDEN', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .get('/api/v1/wallets/admin/withdrawals')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows ADMIN to list withdrawal requests with populated user info and pagination', async () => {
      const mockAdminItem = {
        _id: new mongoose.Types.ObjectId(mockWithdrawalId),
        code: 'WD_ADMIN_1001',
        userId: {
          _id: new mongoose.Types.ObjectId(validUserId),
          fullName: 'Nguyen Van A',
          email: 'user@example.com',
          phone: '0901234567',
        },
        amount: 300000,
        bankInfo: {
          bankName: 'MBBank',
          accountNumber: '99998888',
          accountHolderName: 'NGUYEN VAN A',
        },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockWithdrawalRepo.listForAdmin!.mockResolvedValueOnce({
        items: [mockAdminItem as unknown as IWithdrawalRequest],
        total: 1,
      });

      const token = createToken({ userId: validAdminId, role: 'ADMIN' });
      const res = await request(app)
        .get('/api/v1/wallets/admin/withdrawals?status=pending&page=1&limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].code).toBe('WD_ADMIN_1001');
      expect(res.body.data.items[0].amount).toBe(300000);
      expect(res.body.data.items[0].user.fullName).toBe('Nguyen Van A');
      expect(res.body.data.items[0].user.email).toBe('user@example.com');
      expect(res.body.data.total).toBe(1);
    });

    it('rejects invalid date range (startDate > endDate) with 400 VALIDATION_ERROR', async () => {
      const token = createToken({ userId: validAdminId, role: 'ADMIN' });
      const res = await request(app)
        .get(
          '/api/v1/wallets/admin/withdrawals?startDate=2026-11-20&endDate=2026-11-10',
        )
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('startDate');
    });
  });

  describe('PATCH /api/v1/wallets/admin/withdrawals/:id/process', () => {
    it('denies unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .patch(`/api/v1/wallets/admin/withdrawals/${mockWithdrawalId}/process`)
        .send({ status: 'completed' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('denies non-admin USER with 403 FORBIDDEN', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      const res = await request(app)
        .patch(`/api/v1/wallets/admin/withdrawals/${mockWithdrawalId}/process`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects invalid action status with 400 VALIDATION_ERROR', async () => {
      const token = createToken({ userId: validAdminId, role: 'ADMIN' });
      const res = await request(app)
        .patch(`/api/v1/wallets/admin/withdrawals/${mockWithdrawalId}/process`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'invalid_status' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects rejection without reason (or reason too short) with 400 VALIDATION_ERROR', async () => {
      const token = createToken({ userId: validAdminId, role: 'ADMIN' });
      const res = await request(app)
        .patch(`/api/v1/wallets/admin/withdrawals/${mockWithdrawalId}/process`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'rejected', notes: 'ngan' }); // < 5 ký tự

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('lý do từ chối');
    });

    it('returns 404 WITHDRAWAL_NOT_FOUND when withdrawal does not exist', async () => {
      mockWithdrawalRepo.findById!.mockResolvedValueOnce(null);

      const token = createToken({ userId: validAdminId, role: 'ADMIN' });
      const res = await request(app)
        .patch(`/api/v1/wallets/admin/withdrawals/${mockWithdrawalId}/process`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('WITHDRAWAL_NOT_FOUND');
    });

    it('returns 400 WITHDRAWAL_ALREADY_PROCESSED when withdrawal is already completed or rejected', async () => {
      mockWithdrawalRepo.findById!.mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(mockWithdrawalId),
        status: 'completed',
        amount: 200000,
      } as unknown as IWithdrawalRequest);

      const token = createToken({ userId: validAdminId, role: 'ADMIN' });
      const res = await request(app)
        .patch(`/api/v1/wallets/admin/withdrawals/${mockWithdrawalId}/process`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('WITHDRAWAL_ALREADY_PROCESSED');
      expect(res.body.error.message).toContain('đã được xử lý trước đó');
    });

    it('successfully confirms Completed: marks status completed, saves admin details, and sends notification (NO duplicate debit)', async () => {
      const token = createToken({ userId: validAdminId, role: 'ADMIN' });
      const res = await request(app)
        .patch(`/api/v1/wallets/admin/withdrawals/${mockWithdrawalId}/process`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'completed',
          notes: 'Đã chuyển khoản qua VCB mã GD 998877',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.message).toContain('thành công');

      // Đảm bảo cập nhật DB
      expect(mockWithdrawalRepo.atomicProcessPending).toHaveBeenCalledWith(
        mockWithdrawalId,
        expect.objectContaining({
          status: 'completed',
          processedBy: validAdminId,
          notes: 'Đã chuyển khoản qua VCB mã GD 998877',
        }),
      );

      // Đảm bảo KHÔNG trừ/cộng thêm tiền vào sổ cái (vì tiền đã được trừ lúc tạo lệnh)
      expect(mockLedgerService.recordSingleEntry).not.toHaveBeenCalled();

      // Đảm bảo gửi thông báo thành công cho người dùng
      expect(mockNotifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: expect.anything(),
          title: 'Yêu cầu rút tiền thành công',
          type: 'withdrawal_completed',
        }),
      );
    });

    it('successfully rejects request: marks status rejected, REFUNDS balance via ledger, and sends rejection notification', async () => {
      const token = createToken({ userId: validAdminId, role: 'ADMIN' });
      const res = await request(app)
        .patch(`/api/v1/wallets/admin/withdrawals/${mockWithdrawalId}/process`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          status: 'rejected',
          notes: 'Sai số tài khoản ngân hàng thụ hưởng, vui lòng kiểm tra lại.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('rejected');
      expect(res.body.message).toContain('hoàn lại số dư');

      // Đảm bảo HOÀN TIỀN vào ví người dùng qua LedgerService (credit)
      expect(mockLedgerService.recordSingleEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: mockWalletId,
          amount: 200000,
          type: 'credit',
          postingKey: expect.stringContaining('refund_rejected_wd_'),
          reference: expect.objectContaining({
            kind: 'withdrawal',
          }),
        }),
      );

      // Đảm bảo cập nhật DB sang rejected
      expect(mockWithdrawalRepo.atomicProcessPending).toHaveBeenCalledWith(
        mockWithdrawalId,
        expect.objectContaining({
          status: 'rejected',
          processedBy: validAdminId,
          notes: 'Sai số tài khoản ngân hàng thụ hưởng, vui lòng kiểm tra lại.',
        }),
      );

      // Đảm bảo gửi thông báo từ chối kèm lý do cho người dùng
      expect(mockNotifRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: expect.anything(),
          title: 'Yêu cầu rút tiền bị từ chối',
          body: expect.stringContaining('Sai số tài khoản'),
          type: 'withdrawal_rejected',
        }),
      );
    });
  });
});

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
import type { WalletService } from '../src/services/wallet.service.js';
import type { PaginatedTransactionsDto, WalletDto } from '../src/types/wallet.types.js';

function createToken(payload: { userId: string; role: 'USER' | 'ADMIN' }): string {
  return jwt.sign(payload, env.jwtAccessSecret);
}

describe('Wallet & Ledger APIs (/api/v1/wallets)', () => {
  const validUserId = new mongoose.Types.ObjectId().toString();
  const validAdminId = new mongoose.Types.ObjectId().toString();

  let mockWalletService: Partial<Record<keyof WalletService, ReturnType<typeof vi.fn>>>;
  let app: express.Express;

  beforeEach(() => {
    mockWalletService = {
      getMyWallet: vi.fn(),
      getMyTransactions: vi.fn(),
      getSystemWallet: vi.fn(),
    };

    app = express();
    app.use(express.json());

    const controller = new WalletController(mockWalletService as unknown as WalletService);
    app.use('/api/v1/wallets', authenticate, createWalletRouter(mockWalletService as unknown as WalletService, controller));
    app.use(errorHandler);
  });

  describe('GET /api/v1/wallets/me', () => {
    it('denies unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/wallets/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns wallet details for authenticated USER', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      const walletDto: WalletDto = {
        id: new mongoose.Types.ObjectId().toString(),
        userId: validUserId,
        ownerType: 'user',
        balance: 1500000,
        currency: 'VND',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockWalletService.getMyWallet!.mockResolvedValue(walletDto);

      const res = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.balance).toBe(1500000);
      expect(mockWalletService.getMyWallet).toHaveBeenCalledWith(validUserId);
    });

    it('returns availableBalance and holdingBalance for authenticated USER', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      const walletDto: WalletDto = {
        id: new mongoose.Types.ObjectId().toString(),
        userId: validUserId,
        ownerType: 'user',
        balance: 1500000,
        availableBalance: 1500000,
        holdingBalance: 400000,
        currency: 'VND',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockWalletService.getMyWallet!.mockResolvedValue(walletDto);

      const res = await request(app)
        .get('/api/v1/wallets/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.availableBalance).toBe(1500000);
      expect(res.body.data.holdingBalance).toBe(400000);
    });
  });

  describe('GET /api/v1/wallets/me/transactions', () => {
    it('returns paginated transactions for authenticated USER', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      const transactionsDto: PaginatedTransactionsDto = {
        items: [
          {
            id: new mongoose.Types.ObjectId().toString(),
            walletId: new mongoose.Types.ObjectId().toString(),
            entryKey: 'RENTAL_1_debit',
            postingKey: 'RENTAL_1',
            amount: 200000,
            type: 'debit',
            balanceBefore: 500000,
            balanceAfter: 300000,
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      mockWalletService.getMyTransactions!.mockResolvedValue(transactionsDto);

      const res = await request(app)
        .get('/api/v1/wallets/me/transactions?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.total).toBe(1);
      expect(mockWalletService.getMyTransactions).toHaveBeenCalledWith(validUserId, {
        page: 1,
        limit: 10,
      });
    });

    it('supports filtering transactions by type, kind, and date range', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      mockWalletService.getMyTransactions!.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });

      const res = await request(app)
        .get(
          '/api/v1/wallets/me/transactions?page=1&limit=20&type=credit&kind=payment&startDate=2026-11-01&endDate=2026-11-30',
        )
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockWalletService.getMyTransactions).toHaveBeenCalledWith(
        validUserId,
        expect.objectContaining({
          page: 1,
          limit: 20,
          type: 'credit',
          kind: 'payment',
        }),
      );
    });

    it('rejects startDate later than endDate with 400 VALIDATION_ERROR', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .get(
          '/api/v1/wallets/me/transactions?startDate=2026-12-01&endDate=2026-11-01',
        )
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid pagination parameters with 400 VALIDATION_ERROR', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .get('/api/v1/wallets/me/transactions?page=-1&limit=999')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/wallets/system/:ownerType', () => {
    it('denies normal USER from accessing system escrow wallet with 403 FORBIDDEN', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .get('/api/v1/wallets/system/escrow')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('permits ADMIN to inspect escrow system wallet', async () => {
      const adminToken = createToken({ userId: validAdminId, role: 'ADMIN' });
      const escrowWalletDto: WalletDto = {
        id: new mongoose.Types.ObjectId().toString(),
        userId: null,
        ownerType: 'escrow',
        balance: 50000000,
        currency: 'VND',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockWalletService.getSystemWallet!.mockResolvedValue(escrowWalletDto);

      const res = await request(app)
        .get('/api/v1/wallets/system/escrow')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ownerType).toBe('escrow');
      expect(res.body.data.balance).toBe(50000000);
      expect(mockWalletService.getSystemWallet).toHaveBeenCalledWith('escrow');
    });

    it('permits ADMIN to inspect platform fee wallet', async () => {
      const adminToken = createToken({ userId: validAdminId, role: 'ADMIN' });
      const feeWalletDto: WalletDto = {
        id: new mongoose.Types.ObjectId().toString(),
        userId: null,
        ownerType: 'platform_fee',
        balance: 3200000,
        currency: 'VND',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockWalletService.getSystemWallet!.mockResolvedValue(feeWalletDto);

      const res = await request(app)
        .get('/api/v1/wallets/system/platform_fee')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.ownerType).toBe('platform_fee');
    });

    it('returns 400 VALIDATION_ERROR when querying an invalid system wallet type', async () => {
      const adminToken = createToken({ userId: validAdminId, role: 'ADMIN' });

      const res = await request(app)
        .get('/api/v1/wallets/system/unsupported_type')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

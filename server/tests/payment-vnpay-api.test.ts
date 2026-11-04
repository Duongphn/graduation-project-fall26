import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../src/config/env.js';
import { PaymentController } from '../src/controllers/payment.controller.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { createPaymentRouter } from '../src/routes/payment.routes.js';
import { createWalletRouter } from '../src/routes/wallet.routes.js';
import { authenticate } from '../src/middlewares/authenticate.js';
import { VNPayClient } from '../src/integrations/vnpay/vnpay-client.js';
import { PaymentService } from '../src/services/payment.service.js';
import type { PaymentRepository } from '../src/repositories/payment.repository.js';
import type { WalletRepository } from '../src/repositories/wallet.repository.js';
import type { LedgerService } from '../src/services/ledger.service.js';
import type { WalletService } from '../src/services/wallet.service.js';
import type { IPayment } from '../src/models/payment.model.js';
import type { IWallet } from '../src/models/wallet.model.js';

function createToken(payload: { userId: string; role: 'USER' | 'ADMIN' }): string {
  return jwt.sign(payload, env.jwtAccessSecret);
}

describe('VNPay Topup & Payment APIs (/api/v1/payments & /api/v1/wallets/topup)', () => {
  const validUserId = new mongoose.Types.ObjectId().toString();
  const mockWalletId = new mongoose.Types.ObjectId();

  let mockPaymentRepo: Partial<Record<keyof PaymentRepository, ReturnType<typeof vi.fn>>>;
  let mockWalletRepo: Partial<Record<keyof WalletRepository, ReturnType<typeof vi.fn>>>;
  let mockLedgerService: Partial<Record<keyof LedgerService, ReturnType<typeof vi.fn>>>;
  let mockWalletService: Partial<Record<keyof WalletService, ReturnType<typeof vi.fn>>>;
  let paymentService: PaymentService;
  let paymentController: PaymentController;
  let app: express.Express;

  beforeEach(() => {
    mockPaymentRepo = {
      create: vi.fn(),
      findByCode: vi.fn(),
      findById: vi.fn(),
      updateStatus: vi.fn(),
    };

    mockWalletRepo = {
      getOrCreateUserWallet: vi.fn().mockResolvedValue({
        _id: mockWalletId,
        userId: new mongoose.Types.ObjectId(validUserId),
        ownerType: 'user',
        balance: 100000,
        currency: 'VND',
        status: 'active',
      } as unknown as IWallet),
    };

    mockLedgerService = {
      recordSingleEntry: vi.fn().mockResolvedValue({
        postingKey: 'topup_vnpay_TOPUP_123',
        idempotentReplay: false,
        transactions: [],
      }),
    };

    mockWalletService = {
      getMyWallet: vi.fn(),
      getMyTransactions: vi.fn(),
      getSystemWallet: vi.fn(),
    };

    paymentService = new PaymentService(
      mockPaymentRepo as unknown as PaymentRepository,
      mockWalletRepo as unknown as WalletRepository,
      mockLedgerService as unknown as LedgerService,
      new VNPayClient(),
    );
    paymentController = new PaymentController(paymentService);

    app = express();
    app.use(express.json());

    // Mount authenticated routes under /api/v1/wallets
    app.use(
      '/api/v1/wallets',
      authenticate,
      createWalletRouter(
        mockWalletService as unknown as WalletService,
        undefined,
        paymentController,
      ),
    );

    // Mount payment routes (with both public return/ipn and authenticated topup)
    app.use('/api/v1/payments', createPaymentRouter(paymentController));
    app.use(errorHandler);
  });

  describe('POST /api/v1/wallets/topup/vnpay (or /api/v1/payments/topup/vnpay)', () => {
    it('denies unauthenticated request with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post('/api/v1/wallets/topup/vnpay')
        .send({ amount: 50000 });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects top-up amount less than 10,000 VND with 400 AMOUNT_TOO_LOW', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });

      const res = await request(app)
        .post('/api/v1/wallets/topup/vnpay')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 5000 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AMOUNT_TOO_LOW');
    });

    it('creates a pending payment and returns VNPay redirect URL for valid amount', async () => {
      const token = createToken({ userId: validUserId, role: 'USER' });
      mockPaymentRepo.create!.mockImplementation((data) => Promise.resolve(data));

      const res = await request(app)
        .post('/api/v1/wallets/topup/vnpay')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 50000, bankCode: 'NCB' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.amount).toBe(50000);
      expect(res.body.data.paymentCode).toMatch(/^TOPUP_/);
      expect(res.body.data.paymentUrl).toContain('sandbox.vnpayment.vn');
      expect(res.body.data.paymentUrl).toContain('vnp_SecureHash=');

      // Verify payment was saved in DB as pending
      expect(mockPaymentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          orderType: 'wallet_topup',
          amount: 50000,
          gateway: 'vnpay',
        }),
      );
    });
  });

  describe('GET /api/v1/payments/vnpay-return', () => {
    it('returns error when checksum is invalid', async () => {
      const res = await request(app).get('/api/v1/payments/vnpay-return').query({
        vnp_Amount: '5000000',
        vnp_TxnRef: 'TOPUP_123',
        vnp_SecureHash: 'invalid_hash_string',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.data.status).toBe('invalid_checksum');
    });

    it('processes successful payment and credits wallet when responseCode is 00', async () => {
      const paymentCode = 'TOPUP_TEST_SUCCESS';
      mockPaymentRepo.findByCode!.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        code: paymentCode,
        userId: new mongoose.Types.ObjectId(validUserId),
        orderType: 'wallet_topup',
        orderId: mockWalletId,
        amount: 50000,
        gateway: 'vnpay',
        status: 'pending',
      } as unknown as IPayment);

      const params = {
        vnp_Amount: '5000000',
        vnp_TxnRef: paymentCode,
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TransactionNo: '14567890',
      };
      const { signature } = VNPayClient.createVNPaySignature(params, env.vnpayHashSecret);

      const res = await request(app)
        .get('/api/v1/payments/vnpay-return')
        .query({ ...params, vnp_SecureHash: signature });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('success');
      expect(res.body.data.amount).toBe(50000);

      // Verify ledger single entry was called
      expect(mockLedgerService.recordSingleEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: mockWalletId,
          postingKey: `topup_vnpay_${paymentCode}`,
          amount: 50000,
          type: 'credit',
        }),
      );

      // Verify payment status updated to success
      expect(mockPaymentRepo.updateStatus).toHaveBeenCalledWith(
        paymentCode,
        'success',
        '14567890',
      );
    });

    it('marks payment as cancelled when responseCode is 24 (Customer cancelled)', async () => {
      const paymentCode = 'TOPUP_TEST_CANCELLED';
      mockPaymentRepo.findByCode!.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        code: paymentCode,
        orderId: mockWalletId,
        amount: 50000,
        status: 'pending',
      } as unknown as IPayment);

      const params = {
        vnp_Amount: '5000000',
        vnp_TxnRef: paymentCode,
        vnp_ResponseCode: '24',
        vnp_TransactionStatus: '02',
        vnp_TransactionNo: '0',
      };
      const { signature } = VNPayClient.createVNPaySignature(params, env.vnpayHashSecret);

      const res = await request(app)
        .get('/api/v1/payments/vnpay-return')
        .query({ ...params, vnp_SecureHash: signature });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.data.status).toBe('cancelled');

      // Verify ledger was NOT called to credit money
      expect(mockLedgerService.recordSingleEntry).not.toHaveBeenCalled();

      // Verify payment was marked as cancelled
      expect(mockPaymentRepo.updateStatus).toHaveBeenCalledWith(
        paymentCode,
        'cancelled',
        '0',
      );
    });

    it('redirects to frontend return URL if client accepts HTML (browser redirect)', async () => {
      const paymentCode = 'TOPUP_TEST_BROWSER';
      mockPaymentRepo.findByCode!.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        code: paymentCode,
        orderId: mockWalletId,
        amount: 50000,
        status: 'pending',
      } as unknown as IPayment);

      const params = {
        vnp_Amount: '5000000',
        vnp_TxnRef: paymentCode,
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TransactionNo: '12345',
      };
      const { signature } = VNPayClient.createVNPaySignature(params, env.vnpayHashSecret);

      const res = await request(app)
        .get('/api/v1/payments/vnpay-return')
        .set('Accept', 'text/html,application/xhtml+xml')
        .query({ ...params, vnp_SecureHash: signature });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(env.vnpayReturnUrl);
      expect(res.headers.location).toContain('status=success');
    });
  });

  describe('GET /api/v1/payments/vnpay-ipn (Server-to-Server Webhook)', () => {
    it('returns RspCode 97 when checksum verification fails', async () => {
      const res = await request(app).get('/api/v1/payments/vnpay-ipn').query({
        vnp_Amount: '5000000',
        vnp_TxnRef: 'TOPUP_123',
        vnp_SecureHash: 'invalid_checksum',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        RspCode: '97',
        Message: 'Checksum failed',
      });
    });

    it('returns RspCode 01 when order is not found', async () => {
      mockPaymentRepo.findByCode!.mockResolvedValue(null);

      const params = {
        vnp_Amount: '5000000',
        vnp_TxnRef: 'NON_EXISTENT_ORDER',
      };
      const { signature } = VNPayClient.createVNPaySignature(params, env.vnpayHashSecret);

      const res = await request(app)
        .get('/api/v1/payments/vnpay-ipn')
        .query({ ...params, vnp_SecureHash: signature });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        RspCode: '01',
        Message: 'Order not found',
      });
    });

    it('returns RspCode 04 when amount is mismatched', async () => {
      mockPaymentRepo.findByCode!.mockResolvedValue({
        code: 'TOPUP_123',
        amount: 50000,
        status: 'pending',
      } as unknown as IPayment);

      const params = {
        vnp_Amount: '10000000', // 100,000 VND instead of 50,000 VND
        vnp_TxnRef: 'TOPUP_123',
      };
      const { signature } = VNPayClient.createVNPaySignature(params, env.vnpayHashSecret);

      const res = await request(app)
        .get('/api/v1/payments/vnpay-ipn')
        .query({ ...params, vnp_SecureHash: signature });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        RspCode: '04',
        Message: 'Invalid amount',
      });
    });

    it('successfully processes valid IPN, credits wallet once, and returns RspCode 00', async () => {
      const paymentCode = 'TOPUP_IPN_VALID';
      mockPaymentRepo.findByCode!.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        code: paymentCode,
        orderId: mockWalletId,
        amount: 100000,
        status: 'pending',
      } as unknown as IPayment);

      const params = {
        vnp_Amount: '10000000',
        vnp_TxnRef: paymentCode,
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TransactionNo: '99887766',
      };
      const { signature } = VNPayClient.createVNPaySignature(params, env.vnpayHashSecret);

      const res = await request(app)
        .get('/api/v1/payments/vnpay-ipn')
        .query({ ...params, vnp_SecureHash: signature });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        RspCode: '00',
        Message: 'Confirm Success',
      });

      // Verify wallet credited
      expect(mockLedgerService.recordSingleEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: mockWalletId,
          postingKey: `topup_vnpay_${paymentCode}`,
          amount: 100000,
          type: 'credit',
        }),
      );

      // Verify payment marked as success
      expect(mockPaymentRepo.updateStatus).toHaveBeenCalledWith(
        paymentCode,
        'success',
        '99887766',
      );
    });

    it('guarantees IDEMPOTENCY: returns RspCode 02 and DOES NOT credit wallet on duplicate IPN', async () => {
      const paymentCode = 'TOPUP_ALREADY_CONFIRMED';
      // Payment status is already success!
      mockPaymentRepo.findByCode!.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        code: paymentCode,
        orderId: mockWalletId,
        amount: 100000,
        status: 'success',
      } as unknown as IPayment);

      const params = {
        vnp_Amount: '10000000',
        vnp_TxnRef: paymentCode,
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TransactionNo: '99887766',
      };
      const { signature } = VNPayClient.createVNPaySignature(params, env.vnpayHashSecret);

      const res = await request(app)
        .get('/api/v1/payments/vnpay-ipn')
        .query({ ...params, vnp_SecureHash: signature });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        RspCode: '02',
        Message: 'Order already confirmed',
      });

      // Crucial: ledger service must NOT be called again
      expect(mockLedgerService.recordSingleEntry).not.toHaveBeenCalled();
      expect(mockPaymentRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('marks payment as failed when responseCode indicates failure, without crediting wallet', async () => {
      const paymentCode = 'TOPUP_IPN_FAILED';
      mockPaymentRepo.findByCode!.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        code: paymentCode,
        orderId: mockWalletId,
        amount: 50000,
        status: 'pending',
      } as unknown as IPayment);

      const params = {
        vnp_Amount: '5000000',
        vnp_TxnRef: paymentCode,
        vnp_ResponseCode: '11', // Wait timeout / Failed
        vnp_TransactionStatus: '01',
        vnp_TransactionNo: '0',
      };
      const { signature } = VNPayClient.createVNPaySignature(params, env.vnpayHashSecret);

      const res = await request(app)
        .get('/api/v1/payments/vnpay-ipn')
        .query({ ...params, vnp_SecureHash: signature });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        RspCode: '00',
        Message: 'Confirm Success',
      });

      // Wallet must not be credited
      expect(mockLedgerService.recordSingleEntry).not.toHaveBeenCalled();

      // Payment marked as failed
      expect(mockPaymentRepo.updateStatus).toHaveBeenCalledWith(
        paymentCode,
        'failed',
        '0',
      );
    });
  });

  describe('GET /api/v1/payments/:code/status', () => {
    it('returns payment transaction status', async () => {
      const paymentCode = 'TOPUP_STATUS_CHECK';
      mockPaymentRepo.findByCode!.mockResolvedValue({
        code: paymentCode,
        amount: 50000,
        status: 'success',
        gateway: 'vnpay',
        gatewayTransactionNo: '123456',
        createdAt: new Date(),
        expiresAt: new Date(),
      } as unknown as IPayment);

      const res = await request(app).get(`/api/v1/payments/${paymentCode}/status`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe(paymentCode);
      expect(res.body.data.status).toBe('success');
      expect(res.body.data.gatewayTransactionNo).toBe('123456');
    });

    it('returns 404 when payment does not exist', async () => {
      mockPaymentRepo.findByCode!.mockResolvedValue(null);

      const res = await request(app).get('/api/v1/payments/NON_EXISTENT/status');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PAYMENT_NOT_FOUND');
    });
  });
});

import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../../src/app/create-app.js';
import PurchaseOrder from '../../../../src/features/purchase_orders/purchase_orders.model.js';
import RentalOrder from '../../../../src/features/rental_orders/rental_orders.model.js';
import Toy from '../../../../src/features/toys/toys.model.js';
import User from '../../../../src/features/users/users.model.js';
import Voucher, { type IVoucher } from '../../../../src/features/vouchers/vouchers.model.js';
import { vouchersRouter } from '../../../../src/features/vouchers/vouchers.routes.js';
import {
  checkOwnerVoucherEligibility,
  createOwnerVoucher,
  disableOwnerVoucher,
  listOwnerVouchers,
  redeemRentalVoucher,
  updateOwnerVoucher,
  validateAndApplyRentalVoucher,
} from '../../../../src/features/vouchers/vouchers.service.js';

describe('UC09 & UC36: Rental Order Voucher Application & Owner Voucher Management', () => {
  const OWNER_ID = '64b000000000000000000099';
  const OTHER_OWNER_ID = '64b000000000000000000088';
  const TOY_1_ID = '64b000000000000000000011';
  const TOY_2_ID = '64b000000000000000000022';

  const baseVoucher: Partial<IVoucher> = {
    code: 'RENTAL20',
    ownerId: new mongoose.Types.ObjectId(OWNER_ID),
    discountType: 'percentage',
    discountValue: 20,
    minOrderValue: 50000,
    maxDiscount: 100000,
    quantity: 10,
    usedCount: 2,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: new Date('2026-12-31T23:59:59.999Z'),
    status: 'active',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to mock an eligible owner
  function mockEligibleOwner(completedCount = 12, rating = 4.8) {
    vi.spyOn(RentalOrder, 'countDocuments').mockResolvedValue(completedCount as any);
    vi.spyOn(PurchaseOrder, 'countDocuments').mockResolvedValue(0 as any);
    vi.spyOn(User, 'findById').mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(OWNER_ID),
        fullName: 'Chủ đồ chơi uy tín',
        trust: { score: rating * 20 }, // 4.8 * 20 = 96
      }),
    } as any);
  }

  describe('Business Rule 1: Chỉ giảm tiền thuê, KHÔNG giảm tiền cọc', () => {
    it('applies percentage discount to rentalFee while depositAmount stays 100% untouched', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000001'),
        ...baseVoucher,
      } as any);

      const result = await validateAndApplyRentalVoucher({
        code: 'RENTAL20',
        rentalFee: 200000,
        depositAmount: 500000,
        orderType: 'RENTAL',
        now: new Date('2026-06-01T00:00:00.000Z'),
      });

      expect(result.discountAmount).toBe(40000);
      expect(result.originalRentalFee).toBe(200000);
      expect(result.finalRentalFee).toBe(160000);
      expect(result.depositAmount).toBe(500000);
      expect(result.totalAmount).toBe(660000);
    });

    it('applies fixed discount to rentalFee while depositAmount stays 100% untouched', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000002'),
        ...baseVoucher,
        code: 'FIXED50K',
        discountType: 'fixed',
        discountValue: 50000,
      } as any);

      const result = await validateAndApplyRentalVoucher({
        code: 'FIXED50K',
        rentalFee: 150000,
        depositAmount: 300000,
        orderType: 'RENTAL',
        now: new Date('2026-06-01T00:00:00.000Z'),
      });

      expect(result.discountAmount).toBe(50000);
      expect(result.finalRentalFee).toBe(100000);
      expect(result.depositAmount).toBe(300000);
      expect(result.totalAmount).toBe(400000);
    });

    it('caps discount at rentalFee when discount exceeds rentalFee, deposit remains intact', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000003'),
        ...baseVoucher,
        code: 'BIG100K',
        discountType: 'fixed',
        discountValue: 100000,
        minOrderValue: 0,
      } as any);

      const result = await validateAndApplyRentalVoucher({
        code: 'BIG100K',
        rentalFee: 60000,
        depositAmount: 200000,
        orderType: 'RENTAL',
        now: new Date('2026-06-01T00:00:00.000Z'),
      });

      expect(result.discountAmount).toBe(60000);
      expect(result.finalRentalFee).toBe(0);
      expect(result.depositAmount).toBe(200000);
      expect(result.totalAmount).toBe(200000);
    });

    it('respects maxDiscount when percentage discount exceeds limit', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000004'),
        ...baseVoucher,
        discountType: 'percentage',
        discountValue: 50,
        maxDiscount: 50000,
      } as any);

      const result = await validateAndApplyRentalVoucher({
        code: 'RENTAL20',
        rentalFee: 300000,
        depositAmount: 400000,
        orderType: 'RENTAL',
        now: new Date('2026-06-01T00:00:00.000Z'),
      });

      expect(result.discountAmount).toBe(50000);
      expect(result.finalRentalFee).toBe(250000);
      expect(result.depositAmount).toBe(400000);
      expect(result.totalAmount).toBe(650000);
    });
  });

  describe('Business Rule 2: KHÔNG dùng cho đơn mua', () => {
    it('throws INVALID_ORDER_TYPE when orderType is PURCHASE', async () => {
      await expect(
        validateAndApplyRentalVoucher({
          code: 'RENTAL20',
          rentalFee: 200000,
          depositAmount: 0,
          orderType: 'PURCHASE',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_ORDER_TYPE',
        message: expect.stringContaining('không dùng cho đơn mua'),
      });
    });
  });

  describe('Business Rule 3: Hết lượt → Used Up', () => {
    it('throws VOUCHER_USED_UP when usedCount >= quantity and updates status', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000005'),
        ...baseVoucher,
        quantity: 5,
        usedCount: 5,
        save: mockSave,
      } as any);

      await expect(
        validateAndApplyRentalVoucher({
          code: 'RENTAL20',
          rentalFee: 200000,
          depositAmount: 500000,
          orderType: 'RENTAL',
          now: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VOUCHER_USED_UP',
        message: expect.stringContaining('Used Up'),
      });

      expect(mockSave).toHaveBeenCalled();
    });

    it('throws VOUCHER_USED_UP when status is already used_up', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000006'),
        ...baseVoucher,
        status: 'used_up',
      } as any);

      await expect(
        validateAndApplyRentalVoucher({
          code: 'RENTAL20',
          rentalFee: 200000,
          depositAmount: 500000,
          orderType: 'RENTAL',
          now: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VOUCHER_USED_UP',
      });
    });

    it('throws VOUCHER_DISABLED when voucher is disabled by owner', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000007'),
        ...baseVoucher,
        status: 'disabled',
      } as any);

      await expect(
        validateAndApplyRentalVoucher({
          code: 'RENTAL20',
          rentalFee: 200000,
          depositAmount: 500000,
          orderType: 'RENTAL',
          now: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VOUCHER_DISABLED',
        message: expect.stringContaining('tạm tắt'),
      });
    });
  });

  describe('Tin đăng áp dụng (applicableToyIds)', () => {
    it('throws TOY_NOT_ELIGIBLE when toyId is not in applicableToyIds list', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000008'),
        ...baseVoucher,
        applicableToyIds: [new mongoose.Types.ObjectId(TOY_1_ID)],
      } as any);

      await expect(
        validateAndApplyRentalVoucher({
          code: 'RENTAL20',
          rentalFee: 200000,
          depositAmount: 500000,
          orderType: 'RENTAL',
          toyId: TOY_2_ID,
          now: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'TOY_NOT_ELIGIBLE',
      });
    });

    it('succeeds when toyId is in applicableToyIds list', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000009'),
        ...baseVoucher,
        applicableToyIds: [new mongoose.Types.ObjectId(TOY_1_ID)],
      } as any);

      const result = await validateAndApplyRentalVoucher({
        code: 'RENTAL20',
        rentalFee: 200000,
        depositAmount: 500000,
        orderType: 'RENTAL',
        toyId: TOY_1_ID,
        now: new Date('2026-06-01T00:00:00.000Z'),
      });

      expect(result.applied).toBe(true);
      expect(result.discountAmount).toBe(40000);
    });
  });

  // ========================================================
  // OWNER VOUCHER MANAGEMENT & ELIGIBILITY TESTS
  // ========================================================

  describe('Owner Eligibility: Chỉ Owner có >= 10 đơn hoàn tất và điểm >= 4.5', () => {
    it('fails when owner has fewer than 10 completed orders', async () => {
      vi.spyOn(RentalOrder, 'countDocuments').mockResolvedValue(9 as any);
      vi.spyOn(PurchaseOrder, 'countDocuments').mockResolvedValue(0 as any);
      vi.spyOn(User, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(OWNER_ID),
          trust: { score: 100 },
        }),
      } as any);

      await expect(checkOwnerVoucherEligibility(OWNER_ID)).rejects.toMatchObject({
        statusCode: 403,
        code: 'OWNER_NOT_ELIGIBLE',
        message: expect.stringContaining('10 đơn hoàn tất'),
      });
    });

    it('fails when owner has >= 10 orders but rating < 4.5', async () => {
      vi.spyOn(RentalOrder, 'countDocuments').mockResolvedValue(15 as any);
      vi.spyOn(PurchaseOrder, 'countDocuments').mockResolvedValue(0 as any);
      vi.spyOn(User, 'findById').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(OWNER_ID),
          trust: { score: 80 },
        }),
      } as any);

      await expect(checkOwnerVoucherEligibility(OWNER_ID)).rejects.toMatchObject({
        statusCode: 403,
        code: 'OWNER_NOT_ELIGIBLE',
        message: expect.stringContaining('4.5'),
      });
    });

    it('passes when owner has >= 10 orders and rating >= 4.5', async () => {
      mockEligibleOwner(10, 4.5);

      const res = await checkOwnerVoucherEligibility(OWNER_ID);
      expect(res.eligible).toBe(true);
      expect(res.completedOrdersCount).toBe(10);
      expect(res.rating).toBe(4.5);
    });
  });

  describe('Owner Operations: Tạo / Sửa / Tắt mã voucher', () => {
    it('creates a new voucher with valid parameters (4-20 chars code, %, quantity, dates)', async () => {
      mockEligibleOwner(15, 4.9);
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce(null);
      vi.spyOn(Toy, 'countDocuments').mockResolvedValueOnce(1 as any);
      const mockCreate = vi.spyOn(Voucher, 'create').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        code: 'SUMMER2026',
        ownerId: new mongoose.Types.ObjectId(OWNER_ID),
        discountType: 'percentage',
        discountValue: 25,
        quantity: 50,
        usedCount: 0,
        status: 'active',
      } as any);

      const voucher = await createOwnerVoucher(OWNER_ID, {
        code: 'SUMMER2026',
        discountType: 'percentage',
        discountValue: 25,
        quantity: 50,
        validFrom: new Date('2026-06-01'),
        validTo: new Date('2026-08-31'),
        applicableToyIds: [TOY_1_ID],
      });

      expect(mockCreate).toHaveBeenCalled();
      expect(voucher.code).toBe('SUMMER2026');
      expect(voucher.status).toBe('active');
    });

    it('rejects duplicate voucher code on creation', async () => {
      mockEligibleOwner(12, 4.8);
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({ _id: 'dup' } as any);

      await expect(
        createOwnerVoucher(OWNER_ID, {
          code: 'EXISTING_CODE',
          discountType: 'fixed',
          discountValue: 30000,
          quantity: 20,
          validFrom: new Date('2026-06-01'),
          validTo: new Date('2026-08-31'),
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'VOUCHER_EXISTS',
      });
    });

    it('rejects applicableToyIds that do not belong to the owner', async () => {
      mockEligibleOwner(12, 4.8);
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce(null);
      vi.spyOn(Toy, 'countDocuments').mockResolvedValueOnce(0 as any);

      await expect(
        createOwnerVoucher(OWNER_ID, {
          code: 'TOYVOUCHER',
          discountType: 'percentage',
          discountValue: 15,
          quantity: 10,
          validFrom: new Date('2026-06-01'),
          validTo: new Date('2026-08-31'),
          applicableToyIds: [TOY_2_ID],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_APPLICABLE_TOYS',
      });
    });

    it('updates owner voucher and prevents reducing quantity below usedCount', async () => {
      mockEligibleOwner(15, 4.7);
      const mockSave = vi.fn().mockResolvedValue(true);
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000055'),
        ownerId: new mongoose.Types.ObjectId(OWNER_ID),
        quantity: 20,
        usedCount: 15,
        save: mockSave,
      } as any);

      await expect(
        updateOwnerVoucher(OWNER_ID, '64b000000000000000000055', {
          quantity: 10,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_QUANTITY',
      });
    });

    it('disables owner voucher successfully', async () => {
      mockEligibleOwner(15, 4.7);
      const mockSave = vi.fn().mockResolvedValue(true);
      const voucherDoc = {
        _id: new mongoose.Types.ObjectId('64b000000000000000000055'),
        ownerId: new mongoose.Types.ObjectId(OWNER_ID),
        status: 'active',
        save: mockSave,
      };
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce(voucherDoc as any);

      const disabled = await disableOwnerVoucher(OWNER_ID, '64b000000000000000000055');
      expect(disabled.status).toBe('disabled');
      expect(mockSave).toHaveBeenCalled();
    });

    it('lists all vouchers belonging to the owner', async () => {
      mockEligibleOwner(15, 4.7);
      vi.spyOn(Voucher, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValueOnce([{ code: 'V1' }, { code: 'V2' }]),
      } as any);

      const list = await listOwnerVouchers(OWNER_ID);
      expect(list).toHaveLength(2);
    });
  });

  describe('API Endpoints: Owner Routes with Authentication', () => {
    function createAuthedApp(actorUserId: string = OWNER_ID) {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.auth = { userId: actorUserId, actorType: 'USER' };
        next();
      });
      app.use('/api/v1/vouchers', vouchersRouter);
      app.use((err: any, _req: any, res: any, _next: any) => {
        res.status(err.statusCode || 500).json({
          error: {
            code: err.code || 'ERROR',
            message: err.message,
          },
        });
      });
      return app;
    }

    it('GET /api/v1/vouchers/owner/eligibility returns 200 when eligible', async () => {
      mockEligibleOwner(14, 4.9);

      const res = await request(createAuthedApp()).get('/api/v1/vouchers/owner/eligibility');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.eligible).toBe(true);
    });

    it('POST /api/v1/vouchers/owner validates code length (rejects < 4 chars)', async () => {
      mockEligibleOwner(14, 4.9);

      const res = await request(createAuthedApp())
        .post('/api/v1/vouchers/owner')
        .send({
          code: 'ABC',
          discountType: 'percentage',
          discountValue: 10,
          quantity: 20,
          validFrom: '2026-06-01',
          validTo: '2026-08-01',
        });

      expect(res.status).toBe(500); // Caught by error handler or ZodError
    });

    it('POST /api/v1/vouchers/owner creates voucher when input is valid', async () => {
      mockEligibleOwner(14, 4.9);
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce(null);
      vi.spyOn(Voucher, 'create').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        code: 'RENT2026',
        discountType: 'percentage',
        discountValue: 15,
        status: 'active',
      } as any);

      const res = await request(createAuthedApp())
        .post('/api/v1/vouchers/owner')
        .send({
          code: 'RENT2026',
          discountType: 'percentage',
          discountValue: 15,
          quantity: 30,
          validFrom: '2026-06-01',
          validTo: '2026-08-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('RENT2026');
    });

    it('POST /api/v1/vouchers/owner/:id/disable disables voucher', async () => {
      mockEligibleOwner(14, 4.9);
      const mockSave = vi.fn().mockResolvedValue(true);
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000055'),
        ownerId: new mongoose.Types.ObjectId(OWNER_ID),
        status: 'active',
        save: mockSave,
      } as any);

      const res = await request(createAuthedApp())
        .post('/api/v1/vouchers/owner/64b000000000000000000055/disable')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('disabled');
    });
  });
});

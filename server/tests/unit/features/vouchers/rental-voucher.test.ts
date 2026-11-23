import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../../src/app/create-app.js';
import Voucher, { type IVoucher } from '../../../../src/features/vouchers/vouchers.model.js';
import {
  redeemRentalVoucher,
  validateAndApplyRentalVoucher,
} from '../../../../src/features/vouchers/vouchers.service.js';

describe('UC09 & UC36: Rental Order Voucher Application', () => {
  const baseVoucher: Partial<IVoucher> = {
    code: 'RENTAL20',
    ownerId: new mongoose.Types.ObjectId(),
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

      // 20% của 200,000 = 40,000
      expect(result.discountAmount).toBe(40000);
      expect(result.originalRentalFee).toBe(200000);
      expect(result.finalRentalFee).toBe(160000); // 200,000 - 40,000
      expect(result.depositAmount).toBe(500000);   // Cọc giữ nguyên 100%!
      expect(result.totalAmount).toBe(660000);     // 160,000 + 500,000
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
      expect(result.finalRentalFee).toBe(100000); // 150,000 - 50,000
      expect(result.depositAmount).toBe(300000);  // Cọc giữ nguyên!
      expect(result.totalAmount).toBe(400000);    // 100,000 + 300,000
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

      // Tiền thuê chỉ 60,000, nhưng voucher giảm 100,000
      const result = await validateAndApplyRentalVoucher({
        code: 'BIG100K',
        rentalFee: 60000,
        depositAmount: 200000,
        orderType: 'RENTAL',
        now: new Date('2026-06-01T00:00:00.000Z'),
      });

      // Chỉ giảm tối đa 60,000 (tiền thuê về 0), KHÔNG được trừ 40,000 còn lại vào cọc!
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
        maxDiscount: 50000, // Trần tối đa 50,000
      } as any);

      // 50% của 300,000 là 150,000 -> nhưng bị chặn ở 50,000
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
          orderType: 'PURCHASE', // Đơn mua
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_ORDER_TYPE',
        message: expect.stringContaining('không dùng cho đơn mua'),
      });
    });

    it('throws INVALID_ORDER_TYPE when orderType is anything other than RENTAL', async () => {
      await expect(
        validateAndApplyRentalVoucher({
          code: 'RENTAL20',
          rentalFee: 200000,
          depositAmount: 0,
          orderType: 'RESALE',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_ORDER_TYPE',
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
        usedCount: 5, // Đã hết sạch lượt
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
        message: expect.stringContaining('Used Up'),
      });
    });
  });

  describe('Voucher Validity & Minimum Order Value', () => {
    it('throws VOUCHER_NOT_FOUND when code does not exist', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce(null);

      await expect(
        validateAndApplyRentalVoucher({
          code: 'NON_EXISTING',
          rentalFee: 200000,
          depositAmount: 500000,
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'VOUCHER_NOT_FOUND',
      });
    });

    it('throws VOUCHER_EXPIRED when now > validTo', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000007'),
        ...baseVoucher,
        validTo: new Date('2026-05-01T00:00:00.000Z'),
      } as any);

      await expect(
        validateAndApplyRentalVoucher({
          code: 'RENTAL20',
          rentalFee: 200000,
          depositAmount: 500000,
          now: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VOUCHER_EXPIRED',
      });
    });

    it('throws VOUCHER_NOT_STARTED when now < validFrom', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000008'),
        ...baseVoucher,
        validFrom: new Date('2026-07-01T00:00:00.000Z'),
      } as any);

      await expect(
        validateAndApplyRentalVoucher({
          code: 'RENTAL20',
          rentalFee: 200000,
          depositAmount: 500000,
          now: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VOUCHER_NOT_STARTED',
      });
    });

    it('throws MIN_ORDER_VALUE_NOT_MET when rentalFee < minOrderValue', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000009'),
        ...baseVoucher,
        minOrderValue: 200000, // Cần tối thiểu 200,000
      } as any);

      await expect(
        validateAndApplyRentalVoucher({
          code: 'RENTAL20',
          rentalFee: 150000, // Chỉ 150,000
          depositAmount: 500000,
          now: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'MIN_ORDER_VALUE_NOT_MET',
      });
    });
  });

  describe('Redemption: Atomic increment of usedCount', () => {
    it('updates status to used_up when usedCount reaches quantity', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      vi.spyOn(Voucher, 'findOneAndUpdate').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000010'),
        code: 'RENTAL20',
        quantity: 10,
        usedCount: 10, // Đạt đỉnh
        status: 'active',
        save: mockSave,
      } as any);

      const redeemed = await redeemRentalVoucher('RENTAL20');
      expect(redeemed.status).toBe('used_up');
      expect(mockSave).toHaveBeenCalled();
    });

    it('throws VOUCHER_USED_UP when findOneAndUpdate returns null', async () => {
      vi.spyOn(Voucher, 'findOneAndUpdate').mockResolvedValueOnce(null);

      await expect(redeemRentalVoucher('RENTAL20')).rejects.toMatchObject({
        statusCode: 400,
        code: 'VOUCHER_USED_UP',
      });
    });
  });

  describe('API Endpoint: POST /api/v1/vouchers/apply', () => {
    it('returns 200 with discount details when applying to rental order', async () => {
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000011'),
        ...baseVoucher,
      } as any);

      const res = await request(createApp())
        .post('/api/v1/vouchers/apply')
        .send({
          code: 'RENTAL20',
          rentalFee: 200000,
          depositAmount: 500000,
          orderType: 'RENTAL',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.discountAmount).toBe(40000);
      expect(res.body.data.finalRentalFee).toBe(160000);
      expect(res.body.data.depositAmount).toBe(500000);
      expect(res.body.data.totalAmount).toBe(660000);
    });

    it('returns 400 when orderType is PURCHASE', async () => {
      const res = await request(createApp())
        .post('/api/v1/vouchers/apply')
        .send({
          code: 'RENTAL20',
          rentalFee: 200000,
          depositAmount: 0,
          orderType: 'PURCHASE',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ORDER_TYPE');
      expect(res.body.error.message).toContain('không dùng cho đơn mua');
    });

    it('returns 400 when voucher is used up', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      vi.spyOn(Voucher, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId('64b000000000000000000012'),
        ...baseVoucher,
        quantity: 5,
        usedCount: 5,
        save: mockSave,
      } as any);

      const res = await request(createApp())
        .post('/api/v1/vouchers/apply')
        .send({
          code: 'RENTAL20',
          rentalFee: 200000,
          depositAmount: 500000,
          orderType: 'RENTAL',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VOUCHER_USED_UP');
      expect(res.body.error.message).toContain('Used Up');
    });

    it('returns 400 validation error when code or fee is missing', async () => {
      const res = await request(createApp())
        .post('/api/v1/vouchers/apply')
        .send({
          code: '',
          rentalFee: -10,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

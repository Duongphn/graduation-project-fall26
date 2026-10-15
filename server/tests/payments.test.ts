import request from 'supertest';
import mongoose from 'express';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createApp } from '../src/app/create-app.js';
import { sanitizePayOSDescription, PaymentsService } from '../src/features/payments/payments.service.js';
import { Payment } from '../src/features/payments/payments.model.js';
import * as payosClientModule from '../src/infrastructure/payos/payos-client.js';

describe('Payments & PayOS Module', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sanitizePayOSDescription', () => {
    it('removes Vietnamese diacritics and special symbols', () => {
      const sanitized = sanitizePayOSDescription('Thanh toán đồ chơi Lego!');
      expect(sanitized).toBe('Thanh toan do choi Lego');
    });

    it('truncates descriptions longer than 25 characters', () => {
      const longText = 'Thanh toan don hang cuc ky dai tren 25 ky tu';
      const sanitized = sanitizePayOSDescription(longText);
      expect(sanitized.length).toBeLessThanOrEqual(25);
      expect(sanitized).toBe('Thanh toan don hang cuc k');
    });

    it('falls back to DH<orderCode> if empty', () => {
      const sanitized = sanitizePayOSDescription('', 123456);
      expect(sanitized).toBe('DH123456');
    });
  });

  describe('API Endpoints Validation', () => {
    it('rejects create-link with amount < 1000', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/v1/payments/create-link')
        .send({
          amount: 500,
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error?.details)).toContain('1,000');
    });

    it('rejects order lookup with invalid non-numeric orderCode', async () => {
      const app = createApp();
      const res = await request(app).get('/api/v1/payments/order/invalid-code');
      expect(res.status).toBe(400);
    });

    it('returns 404 when payment record not found in system', async () => {
      const app = createApp();
      vi.spyOn(Payment, 'findOne').mockResolvedValue(null as any);

      const res = await request(app).get('/api/v1/payments/order/999999999');
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('PAYMENT_NOT_FOUND');
    });
  });

  describe('PaymentsService Webhook Processing', () => {
    it('verifies webhook signature and updates payment status to completed', async () => {
      const service = new PaymentsService();
      const mockOrderCode = 888999111;

      const mockPayOSClient = {
        webhooks: {
          verify: vi.fn().mockResolvedValue({
            orderCode: mockOrderCode,
            amount: 50000,
            reference: 'FT260012345678',
            code: '00',
            desc: 'Success',
          }),
        },
      };

      vi.spyOn(payosClientModule, 'getPayOSClient').mockReturnValue(mockPayOSClient as any);

      const saveMock = vi.fn().mockResolvedValue(true);
      vi.spyOn(Payment, 'findOne').mockResolvedValue({
        code: String(mockOrderCode),
        status: 'pending',
        gatewayTransactionNo: 'old-ref',
        save: saveMock,
      } as any);

      const result = await service.handleWebhook({ dummy: 'payload' });

      expect(mockPayOSClient.webhooks.verify).toHaveBeenCalled();
      expect(saveMock).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.orderCode).toBe(mockOrderCode);
      expect(result.status).toBe('completed');
    });

    it('throws error on invalid webhook signature', async () => {
      const service = new PaymentsService();

      const mockPayOSClient = {
        webhooks: {
          verify: vi.fn().mockRejectedValue(new Error('Invalid signature')),
        },
      };

      vi.spyOn(payosClientModule, 'getPayOSClient').mockReturnValue(mockPayOSClient as any);

      await expect(service.handleWebhook({ dummy: 'tampered' })).rejects.toThrow(
        'Chữ ký Webhook không hợp lệ',
      );
    });
  });
});

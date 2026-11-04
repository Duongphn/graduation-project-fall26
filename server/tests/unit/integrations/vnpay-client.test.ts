import { describe, expect, it } from 'vitest';
import { VNPayClient } from '../../../src/integrations/vnpay/vnpay-client.js';

describe('VNPayClient', () => {
  const secretKey = 'TEST_SECRET_KEY';

  describe('formatDate', () => {
    it('formats a date to yyyyMMddHHmmss format string', () => {
      const fixedDate = new Date('2026-11-04T12:00:00Z');
      const formatted = VNPayClient.formatDate(fixedDate);

      expect(formatted).toMatch(/^\d{14}$/);
      expect(formatted.length).toBe(14);
    });
  });

  describe('createVNPaySignature and verifySignature', () => {
    it('correctly creates and verifies signature with sorted params', () => {
      const params = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: 'DEMO123',
        vnp_Amount: '5000000',
        vnp_CurrCode: 'VND',
        vnp_TxnRef: 'TOPUP_123',
        vnp_OrderInfo: 'Nap tien ToyFlow',
      };

      const { signature } = VNPayClient.createVNPaySignature(params, secretKey);
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBe(128); // SHA-512 hex is 128 characters

      // Verification with matching hash
      const verified = VNPayClient.verifySignature(
        { ...params, vnp_SecureHash: signature },
        secretKey,
      );
      expect(verified).toBe(true);
    });

    it('rejects signature if any parameter is tampered with', () => {
      const params = {
        vnp_Amount: '5000000',
        vnp_TxnRef: 'TOPUP_123',
      };

      const { signature } = VNPayClient.createVNPaySignature(params, secretKey);

      // Tamper amount
      const verified = VNPayClient.verifySignature(
        { ...params, vnp_Amount: '9999999', vnp_SecureHash: signature },
        secretKey,
      );
      expect(verified).toBe(false);
    });

    it('returns false when vnp_SecureHash is missing', () => {
      const verified = VNPayClient.verifySignature({ vnp_Amount: '5000000' }, secretKey);
      expect(verified).toBe(false);
    });
  });

  describe('buildPaymentUrl', () => {
    it('assembles a full redirect URL with query string and signature', () => {
      const url = VNPayClient.buildPaymentUrl({
        tmnCode: 'TMN123',
        hashSecret: secretKey,
        paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
        returnUrl: 'http://localhost:5173/wallet/topup/result',
        amount: 50000,
        txnRef: 'TOPUP_001',
        orderInfo: 'Nap tien ToyFlow',
        clientIp: '127.0.0.1',
        bankCode: 'NCB',
      });

      expect(url).toContain('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?');
      expect(url).toContain('vnp_TmnCode=TMN123');
      expect(url).toContain('vnp_Amount=5000000');
      expect(url).toContain('vnp_BankCode=NCB');
      expect(url).toContain('vnp_TxnRef=TOPUP_001');
      expect(url).toContain('vnp_SecureHash=');
    });
  });
});


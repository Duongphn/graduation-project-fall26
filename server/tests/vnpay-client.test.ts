import { describe, expect, it } from 'vitest';
import { VNPayClient } from '../src/integrations/vnpay/vnpay-client.js';

// VNPay 2.1.0 signature and payment link (no call to VNPay).
describe('VNPayClient', () => {
  const secret = 'TEST_SECRET_KEY';

  it('formats dates as yyyyMMddHHmmss in Vietnam time', () => {
    expect(VNPayClient.formatDate(new Date('2026-11-04T17:30:05Z'))).toBe('20261105003005');
  });

  it('signs the parameters sorted by name, spaces as "+", without the hash fields and empty values', () => {
    const { signData, signature } = VNPayClient.createSignature(
      {
        vnp_TxnRef: 'TOPUP1',
        vnp_Amount: 5_000_000,
        vnp_OrderInfo: 'Nap tien vi',
        vnp_BankCode: '',
        vnp_SecureHash: 'ignored',
      },
      secret,
    );

    expect(signData).toBe('vnp_Amount=5000000&vnp_OrderInfo=Nap+tien+vi&vnp_TxnRef=TOPUP1');
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
  });

  it('accepts its own signature (any case) and rejects tampered, missing or malformed hashes', () => {
    const params = { vnp_Amount: '5000000', vnp_TxnRef: 'TOPUP1', vnp_ResponseCode: '00' };
    const { signature } = VNPayClient.createSignature(params, secret);

    expect(VNPayClient.verifySignature({ ...params, vnp_SecureHash: signature }, secret)).toBe(true);
    expect(VNPayClient.verifySignature({ ...params, vnp_SecureHash: signature.toUpperCase() }, secret)).toBe(true);
    expect(VNPayClient.verifySignature({ ...params, vnp_Amount: '9999900', vnp_SecureHash: signature }, secret)).toBe(
      false,
    );
    expect(VNPayClient.verifySignature({ ...params, vnp_SecureHash: signature }, 'OTHER_SECRET')).toBe(false);
    expect(VNPayClient.verifySignature(params, secret)).toBe(false);
    expect(VNPayClient.verifySignature({ ...params, vnp_SecureHash: 'abc' }, secret)).toBe(false);
  });

  it('builds a signed link with the 2.1.0 fields, amount × 100 and the expiry date', () => {
    const url = VNPayClient.buildPaymentUrl({
      tmnCode: 'TMN123',
      hashSecret: secret,
      paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      returnUrl: 'http://localhost:5173/wallet/topup/result',
      amount: 50_000,
      txnRef: 'TOPUP001',
      orderInfo: 'Nap tien vi ToyFlow TOPUP001',
      clientIp: '127.0.0.1',
      createDate: new Date('2026-11-04T05:00:00Z'),
      expireDate: new Date('2026-11-04T05:15:00Z'),
      bankCode: 'NCB',
    });

    const [base, query] = url.split('?');
    const params = Object.fromEntries(new URLSearchParams(query));
    expect(base).toBe('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
    expect(params).toMatchObject({
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: 'TMN123',
      vnp_Amount: '5000000',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: 'TOPUP001',
      vnp_BankCode: 'NCB',
      vnp_CreateDate: '20261104120000',
      vnp_ExpireDate: '20261104121500',
      vnp_ReturnUrl: 'http://localhost:5173/wallet/topup/result',
    });
    // VNPay checks the same signature on its side
    expect(VNPayClient.verifySignature(params, secret)).toBe(true);
  });
});

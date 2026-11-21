import type { Model } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createContainer } from '../src/container.js';
import { VNPayClient } from '../src/integrations/vnpay/vnpay-client.js';
import { Payment as PaymentModel, WalletTransaction } from '../src/models/index.js';
import type { PaymentRecord } from '../src/repositories/payment.repository.js';
import { authHeader, createUser } from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

/** The model file has no document type */
const Payment = PaymentModel as unknown as Model<PaymentRecord>;

// UC17 Top up wallet via VNPay sandbox. VNPay is never called: the tests sign the IPN / Return
// queries themselves with the test hash secret.
describe('VNPay top-up API', () => {
  const vnpayConfig = {
    tmnCode: 'TESTTMN1',
    hashSecret: 'TEST_HASH_SECRET',
    paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: 'http://localhost:5173/wallet/topup/result',
  };
  const container = createContainer({ vnpayConfig });
  const app = createApp(undefined, container);
  let userId: string;

  /** Query VNPay sends back for payment `code` (signed like VNPay does) */
  const vnpayQuery = (
    code: string,
    amount: number,
    overrides: Record<string, string> = {},
    secret = vnpayConfig.hashSecret,
  ) => {
    const params: Record<string, string> = {
      vnp_Amount: String(amount * 100),
      vnp_BankCode: 'NCB',
      vnp_OrderInfo: `Nap tien vi ToyFlow ${code}`,
      vnp_PayDate: '20261119103000',
      vnp_ResponseCode: '00',
      vnp_TmnCode: vnpayConfig.tmnCode,
      vnp_TransactionNo: '14567890',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: code,
      ...overrides,
    };
    const { signature } = VNPayClient.createSignature(params, secret);
    return { ...params, vnp_SecureHash: signature };
  };

  const balanceOf = async (id: string) =>
    (await request(app).get('/api/v1/wallets/me').set(authHeader(id))).body.data.availableBalance as number;

  const startTopup = async (amount = 200_000) => {
    const res = await request(app).post('/api/v1/payments/topup/vnpay').set(authHeader(userId)).send({ amount });
    expect(res.status).toBe(201);
    return res.body.data as { paymentUrl: string; paymentCode: string; amount: number };
  };

  const ipn = (query: Record<string, string>) => request(app).get('/api/v1/payments/vnpay-ipn').query(query);
  const returnUrl = (query: Record<string, string>) => request(app).get('/api/v1/payments/vnpay-return').query(query);

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    userId = (await createUser())._id.toString();
  });

  it('creates a pending payment and a signed VNPay link that expires in 15 minutes', async () => {
    const { paymentUrl, paymentCode, amount } = await startTopup(200_000);

    expect(amount).toBe(200_000);
    expect(paymentCode).toMatch(/^TOPUP\d+$/);
    const params = Object.fromEntries(new URL(paymentUrl).searchParams);
    expect(params).toMatchObject({
      vnp_TmnCode: 'TESTTMN1',
      vnp_Amount: '20000000',
      vnp_TxnRef: paymentCode,
      vnp_ReturnUrl: vnpayConfig.returnUrl,
    });
    expect(VNPayClient.verifySignature(params, vnpayConfig.hashSecret)).toBe(true);

    const payment = await Payment.findOne({ code: paymentCode }).lean();
    expect(payment).toMatchObject({ status: 'pending', amount: 200_000, gateway: 'vnpay', orderType: 'wallet_topup' });
    const minutes = (payment!.expiresAt!.getTime() - payment!.createdAt.getTime()) / 60_000;
    expect(Math.round(minutes)).toBe(15);
  });

  it('credits the wallet once from the IPN and answers VNPay with the right codes', async () => {
    const { paymentCode } = await startTopup(200_000);

    const first = await ipn(vnpayQuery(paymentCode, 200_000));
    expect(first.body).toEqual({ RspCode: '00', Message: 'Confirm Success' });
    expect(await balanceOf(userId)).toBe(200_000);

    const again = await ipn(vnpayQuery(paymentCode, 200_000));
    expect(again.body).toEqual({ RspCode: '02', Message: 'Order already confirmed' });
    expect(await balanceOf(userId)).toBe(200_000);

    const payment = await Payment.findOne({ code: paymentCode }).lean();
    expect(payment).toMatchObject({ status: 'success', gatewayResponseCode: '00', gatewayTransactionNo: '14567890' });

    // The history shows it as kind "payment" (filter "Nạp tiền" on the wallet screen)
    const history = await request(app)
      .get('/api/v1/wallets/me/transactions?kind=payment')
      .set(authHeader(userId));
    expect(history.body.data.items).toHaveLength(1);
    expect(history.body.data.items[0]).toMatchObject({ amount: 200_000, type: 'credit' });
  });

  it('settles from the Return URL when the IPN has not come, and the later IPN does not credit again', async () => {
    const { paymentCode } = await startTopup(150_000);

    const res = await returnUrl(vnpayQuery(paymentCode, 150_000));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { success: true, status: 'success', paymentCode, amount: 150_000 },
    });

    expect((await ipn(vnpayQuery(paymentCode, 150_000))).body.RspCode).toBe('02');
    expect(await balanceOf(userId)).toBe(150_000);

    // Opening the result page again shows the same result
    expect((await returnUrl(vnpayQuery(paymentCode, 150_000))).body.data.status).toBe('success');
  });

  it('credits once when the IPN and the Return URL arrive at the same time', async () => {
    const { paymentCode } = await startTopup(300_000);
    const query = vnpayQuery(paymentCode, 300_000);

    const [ipnRes, returnRes] = await Promise.all([ipn(query), returnUrl(query)]);

    // Whichever came first credited the wallet; the IPN answers 00 (it won) or 02 (Return URL won)
    expect(['00', '02']).toContain(ipnRes.body.RspCode);
    expect(returnRes.body.data.status).toBe('success');
    expect(await balanceOf(userId)).toBe(300_000);
    expect(await WalletTransaction.countDocuments({ postingKey: `topup:${paymentCode}` })).toBe(2);
  });

  it('marks a cancelled payment as failed and tells the result page it was cancelled', async () => {
    const { paymentCode } = await startTopup();

    const res = await returnUrl(vnpayQuery(paymentCode, 200_000, { vnp_ResponseCode: '24', vnp_TransactionNo: '0', vnp_TransactionStatus: '02' }));

    expect(res.body).toMatchObject({ success: false, data: { status: 'cancelled', success: false } });
    expect(await Payment.findOne({ code: paymentCode }).lean()).toMatchObject({
      status: 'failed',
      gatewayResponseCode: '24',
    });
    expect(await balanceOf(userId)).toBe(0);
    // A late IPN for the same payment changes nothing
    expect((await ipn(vnpayQuery(paymentCode, 200_000))).body.RspCode).toBe('02');
    expect(await balanceOf(userId)).toBe(0);

    // A second cancelled payment (VNPay sends vnp_TransactionNo=0 again) is fine
    const second = await startTopup();
    const again = await returnUrl(vnpayQuery(second.paymentCode, 200_000, { vnp_ResponseCode: '24', vnp_TransactionNo: '0', vnp_TransactionStatus: '02' }));
    expect(again.body.data.status).toBe('cancelled');
  });

  it('marks a declined payment as failed', async () => {
    const { paymentCode } = await startTopup();

    const res = await ipn(vnpayQuery(paymentCode, 200_000, { vnp_ResponseCode: '51', vnp_TransactionStatus: '02' }));

    expect(res.body.RspCode).toBe('00');
    expect((await returnUrl(vnpayQuery(paymentCode, 200_000))).body.data.status).toBe('failed');
    expect(await balanceOf(userId)).toBe(0);
  });

  it('rejects a wrong checksum, a wrong amount and an unknown payment', async () => {
    const { paymentCode } = await startTopup(200_000);

    expect((await ipn(vnpayQuery(paymentCode, 200_000, {}, 'WRONG_SECRET'))).body.RspCode).toBe('97');
    expect((await returnUrl(vnpayQuery(paymentCode, 200_000, {}, 'WRONG_SECRET'))).body.data.status).toBe(
      'invalid_checksum',
    );
    expect((await ipn(vnpayQuery(paymentCode, 999_000))).body.RspCode).toBe('04');
    expect((await ipn(vnpayQuery('TOPUP0000', 200_000))).body.RspCode).toBe('01');
    expect((await returnUrl(vnpayQuery('TOPUP0000', 200_000))).body.data.status).toBe('not_found');

    expect(await Payment.findOne({ code: paymentCode }).lean()).toMatchObject({ status: 'pending' });
    expect(await balanceOf(userId)).toBe(0);
  });

  it('fails top-ups still pending long after their link expired', async () => {
    const stale = await startTopup();
    const fresh = await startTopup();
    await Payment.updateOne({ code: stale.paymentCode }, { $set: { expiresAt: new Date(Date.now() - 20 * 60_000) } });

    expect(await container.paymentService.expireStalePayments()).toEqual({ expired: 1 });

    expect(await Payment.findOne({ code: stale.paymentCode }).lean()).toMatchObject({ status: 'failed' });
    expect(await Payment.findOne({ code: fresh.paymentCode }).lean()).toMatchObject({ status: 'pending' });
    const res = await returnUrl(vnpayQuery(stale.paymentCode, 200_000, { vnp_ResponseCode: '24' }));
    expect(res.body.data).toMatchObject({ status: 'failed', message: 'Giao dịch nạp tiền đã hết hạn.' });
  });

  it('validates the amount, needs a signed-in user and reports a missing VNPay setup', async () => {
    const low = await request(app).post('/api/v1/payments/topup/vnpay').set(authHeader(userId)).send({ amount: 9_999 });
    expect(low.status).toBe(400);
    const high = await request(app)
      .post('/api/v1/payments/topup/vnpay')
      .set(authHeader(userId))
      .send({ amount: 100_000_001 });
    expect(high.status).toBe(400);
    const anon = await request(app).post('/api/v1/payments/topup/vnpay').send({ amount: 50_000 });
    expect(anon.status).toBe(401);

    const unconfigured = createApp(undefined, createContainer({ vnpayConfig: { ...vnpayConfig, tmnCode: '' } }));
    const res = await request(unconfigured).post('/api/v1/payments/topup/vnpay').set(authHeader(userId)).send({ amount: 50_000 });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PAYMENT_GATEWAY_NOT_CONFIGURED');
  });

  it('shows a payment status to its owner only', async () => {
    const { paymentCode } = await startTopup();

    const own = await request(app).get(`/api/v1/payments/${paymentCode}/status`).set(authHeader(userId));
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({ code: paymentCode, status: 'pending', amount: 200_000 });

    const other = (await createUser())._id.toString();
    const res = await request(app).get(`/api/v1/payments/${paymentCode}/status`).set(authHeader(other));
    expect(res.status).toBe(404);
  });
});

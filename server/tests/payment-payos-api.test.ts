import type { Model } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createContainer } from '../src/container.js';
import type {
  PayOSCreateLinkInput,
  PayOSGateway,
  PayOSLinkState,
  PayOSWebhookData,
} from '../src/interfaces/payment.ports.js';
import { Payment as PaymentModel, WalletTransaction } from '../src/models/index.js';
import type { PaymentRecord } from '../src/repositories/payment.repository.js';
import { authHeader, createUser } from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

/** The model file has no document type */
const Payment = PaymentModel as unknown as Model<PaymentRecord>;

/** PayOS stand-in: records the links it was asked for, returns the status the test sets */
class FakePayOS implements PayOSGateway {
  public links: PayOSCreateLinkInput[] = [];
  public states = new Map<number, PayOSLinkState>();
  public failCreate = false;

  public async createPaymentLink(input: PayOSCreateLinkInput) {
    if (this.failCreate) throw new Error('PayOS is down');
    this.links.push(input);
    this.states.set(input.orderCode, { status: 'PENDING', amount: input.amount, amountPaid: 0 });
    return {
      checkoutUrl: `https://pay.payos.vn/web/${input.orderCode}`,
      qrCode: `000201010212${input.orderCode}`,
      paymentLinkId: `link-${input.orderCode}`,
    };
  }

  public async getPaymentLink(orderCode: number) {
    const state = this.states.get(orderCode);
    if (!state) throw new Error('not found');
    return state;
  }

  /** A body is "signed" when it carries signature 'valid' */
  public async verifyWebhook(body: unknown): Promise<PayOSWebhookData> {
    const webhook = body as { signature?: string; data?: PayOSWebhookData };
    if (webhook.signature !== 'valid' || !webhook.data) throw new Error('Invalid signature');
    return webhook.data;
  }
}

// UC17 top-up by bank transfer through PayOS (VietQR). PayOS is never called: a fake gateway
// stands in for the SDK.
describe('PayOS top-up API', () => {
  const payosConfig = {
    clientId: 'client',
    apiKey: 'key',
    checksumKey: 'checksum',
    returnUrl: 'http://localhost:5173/wallet/topup/payos-result',
  };
  let payos: FakePayOS;
  let container: ReturnType<typeof createContainer>;
  let app: ReturnType<typeof createApp>;
  let userId: string;

  const balanceOf = async (id = userId) =>
    (await request(app).get('/api/v1/wallets/me').set(authHeader(id))).body.data.availableBalance as number;

  const startTopup = async (amount = 200_000) => {
    const res = await request(app).post('/api/v1/payments/topup/payos').set(authHeader(userId)).send({ amount });
    expect(res.status).toBe(201);
    return res.body.data as { checkoutUrl: string; qrCode: string; paymentCode: string; amount: number };
  };

  const confirm = (orderCode: string, id = userId) =>
    request(app).get(`/api/v1/payments/payos-return?orderCode=${orderCode}&status=PAID&cancel=false`).set(authHeader(id));

  const webhook = (orderCode: string, amount: number, signature = 'valid') =>
    request(app)
      .post('/api/v1/payments/payos-webhook')
      .send({
        code: '00',
        desc: 'success',
        success: true,
        signature,
        data: { orderCode: Number(orderCode), amount, code: '00', reference: `FT${orderCode}` },
      });

  const markPaid = (orderCode: string, amount: number) =>
    payos.states.set(Number(orderCode), { status: 'PAID', amount, amountPaid: amount, reference: `FT${orderCode}` });

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    payos = new FakePayOS();
    container = createContainer({ payosConfig, payosGateway: payos });
    app = createApp(undefined, container);
    userId = (await createUser())._id.toString();
  });

  it('creates a pending payment and a PayOS link with a short transfer note', async () => {
    const { checkoutUrl, qrCode, paymentCode, amount } = await startTopup(200_000);

    expect(paymentCode).toMatch(/^\d{13}$/);
    expect(checkoutUrl).toContain(paymentCode);
    expect(qrCode).toBeTruthy();
    expect(amount).toBe(200_000);
    expect(payos.links[0]).toMatchObject({
      orderCode: Number(paymentCode),
      amount: 200_000,
      returnUrl: payosConfig.returnUrl,
      cancelUrl: payosConfig.returnUrl,
    });
    expect(payos.links[0]!.description.length).toBeLessThanOrEqual(25);
    expect(await Payment.findOne({ code: paymentCode }).lean()).toMatchObject({
      gateway: 'payos',
      status: 'pending',
      gatewayLinkId: `link-${paymentCode}`,
    });
  });

  it('credits the wallet once from the webhook, and the result page shows success', async () => {
    const { paymentCode } = await startTopup(150_000);

    expect((await webhook(paymentCode, 150_000)).status).toBe(200);
    expect((await webhook(paymentCode, 150_000)).status).toBe(200);
    expect(await balanceOf()).toBe(150_000);
    expect(await Payment.findOne({ code: paymentCode }).lean()).toMatchObject({
      status: 'success',
      gatewayTransactionNo: `FT${paymentCode}`,
    });

    const res = await confirm(paymentCode);
    expect(res.body).toMatchObject({ success: true, data: { status: 'success', paymentCode, amount: 150_000 } });

    const history = await request(app).get('/api/v1/wallets/me/transactions?kind=payment').set(authHeader(userId));
    expect(history.body.data.items).toHaveLength(1);
    expect(history.body.data.items[0].description).toContain('PayOS');
  });

  it('settles from the return page by asking PayOS when no webhook came', async () => {
    const { paymentCode } = await startTopup(100_000);

    // Back before the transfer arrived: still pending
    const early = await confirm(paymentCode);
    expect(early.body.data).toMatchObject({ status: 'pending' });
    expect(await balanceOf()).toBe(0);

    markPaid(paymentCode, 100_000);
    const res = await confirm(paymentCode);
    expect(res.body.data).toMatchObject({ success: true, status: 'success' });
    expect(await balanceOf()).toBe(100_000);

    // The late webhook changes nothing
    await webhook(paymentCode, 100_000);
    expect(await balanceOf()).toBe(100_000);
  });

  it('credits once when the webhook and the return page arrive together', async () => {
    const { paymentCode } = await startTopup(300_000);
    markPaid(paymentCode, 300_000);

    const [hook, page] = await Promise.all([webhook(paymentCode, 300_000), confirm(paymentCode)]);

    expect(hook.status).toBe(200);
    expect(page.body.data.status).toBe('success');
    expect(await balanceOf()).toBe(300_000);
    expect(await WalletTransaction.countDocuments({ postingKey: `topup:${paymentCode}` })).toBe(2);
  });

  it('marks a cancelled or expired link as failed', async () => {
    const cancelled = await startTopup();
    payos.states.set(Number(cancelled.paymentCode), { status: 'CANCELLED', amount: 200_000, amountPaid: 0 });
    const res = await confirm(cancelled.paymentCode);
    expect(res.body).toMatchObject({ success: false, data: { status: 'cancelled' } });
    expect(await Payment.findOne({ code: cancelled.paymentCode }).lean()).toMatchObject({
      status: 'failed',
      gatewayResponseCode: 'CANCELLED',
    });

    const expired = await startTopup();
    payos.states.set(Number(expired.paymentCode), { status: 'EXPIRED', amount: 200_000, amountPaid: 0 });
    expect((await confirm(expired.paymentCode)).body.data.status).toBe('failed');
    expect(await balanceOf()).toBe(0);
  });

  it('ignores a webhook with a wrong signature, a wrong amount or an unknown order', async () => {
    const { paymentCode } = await startTopup(200_000);

    const forged = await webhook(paymentCode, 200_000, 'forged');
    expect(forged.status).toBe(400);
    expect(forged.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');

    expect((await webhook(paymentCode, 999_000)).status).toBe(200);
    // PayOS's test webhook when the URL is confirmed
    expect((await webhook('123', 2_000)).status).toBe(200);

    expect(await Payment.findOne({ code: paymentCode }).lean()).toMatchObject({ status: 'pending' });
    expect(await balanceOf()).toBe(0);
  });

  it('expiry job: credits a paid PayOS top-up nobody came back for, fails the unpaid ones', async () => {
    const paid = await startTopup(120_000);
    const unpaid = await startTopup(80_000);
    const fresh = await startTopup(50_000);
    const longAgo = new Date(Date.now() - 40 * 60_000);
    await Payment.updateMany({ code: { $in: [paid.paymentCode, unpaid.paymentCode] } }, { $set: { expiresAt: longAgo } });
    markPaid(paid.paymentCode, 120_000);

    expect(await container.payosTopupService.reconcileExpired()).toEqual({ credited: 1, expired: 1 });

    expect(await balanceOf()).toBe(120_000);
    expect(await Payment.findOne({ code: paid.paymentCode }).lean()).toMatchObject({ status: 'success' });
    expect(await Payment.findOne({ code: unpaid.paymentCode }).lean()).toMatchObject({
      status: 'failed',
      gatewayResponseCode: 'expired',
    });
    expect(await Payment.findOne({ code: fresh.paymentCode }).lean()).toMatchObject({ status: 'pending' });
    // The VNPay expiry does not touch PayOS payments
    expect(await container.paymentService.expireStalePayments()).toEqual({ expired: 0 });
  });

  it('does not credit a partly paid link', async () => {
    const { paymentCode } = await startTopup(200_000);
    payos.states.set(Number(paymentCode), { status: 'UNDERPAID', amount: 200_000, amountPaid: 50_000 });

    expect((await confirm(paymentCode)).body.data.status).toBe('pending');
    expect(await balanceOf()).toBe(0);
  });

  it('shows the result to the owner only', async () => {
    const { paymentCode } = await startTopup();
    markPaid(paymentCode, 200_000);
    const other = (await createUser())._id.toString();

    const res = await confirm(paymentCode, other);
    expect(res.body.data.status).toBe('not_found');
    expect(await balanceOf()).toBe(0);
  });

  it('reports PayOS problems and a missing setup', async () => {
    payos.failCreate = true;
    const res = await request(app).post('/api/v1/payments/topup/payos').set(authHeader(userId)).send({ amount: 50_000 });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PAYOS_GATEWAY_ERROR');
    expect(await Payment.findOne({ gateway: 'payos' }).lean()).toMatchObject({ status: 'failed' });

    const unconfigured = createApp(undefined, createContainer({ payosConfig: { ...payosConfig, apiKey: '' }, payosGateway: payos }));
    const missing = await request(unconfigured).post('/api/v1/payments/topup/payos').set(authHeader(userId)).send({ amount: 50_000 });
    expect(missing.status).toBe(503);

    const low = await request(app).post('/api/v1/payments/topup/payos').set(authHeader(userId)).send({ amount: 5_000 });
    expect(low.status).toBe(400);
    expect((await request(app).post('/api/v1/payments/topup/payos').send({ amount: 50_000 })).status).toBe(401);
  });
});

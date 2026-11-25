import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import {
  Category,
  PurchaseOrder,
  RentalOrder,
  SystemSetting,
  Toy,
  Wallet,
} from '../src/models/index.js';
import { WalletLedgerRepository } from '../src/repositories/wallet-ledger.repository.js';
import { PurchaseOrderService } from '../src/services/purchase-order.service.js';
import { withOrderPolicy } from '../src/services/rental-policy.js';
import { domainEvents } from '../src/utils/domain-events.js';
import { DEFAULT_RENTAL_SETTINGS } from '../src/types/rental-order.types.js';
import {
  authHeader,
  buildRentalApp,
  createRentToy,
  createUser,
  FakeClock,
  fund,
} from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

// GB-38: a change of a System Setting (UC30) applies only to transactions created after it.
// Each order keeps the rates and time limits it was created with.

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const HOUR = 3_600_000;
const PHOTOS = [{ url: 'https://res.cloudinary.com/demo/pack.jpg', publicId: 'pack_1' }];

const setSettings = async (values: Record<string, string>) => {
  for (const [key, value] of Object.entries(values)) {
    await SystemSetting.updateOne({ key }, { $set: { value } }, { upsert: true });
  }
};

beforeAll(async () => {
  await startReplSet();
});

afterAll(async () => {
  await stopReplSet();
});

describe('withOrderPolicy', () => {
  it('uses the copy kept on the order and the latest value for the rest', () => {
    const current = { ...DEFAULT_RENTAL_SETTINGS, paymentHours: 6, maxDays: 10 };
    expect(withOrderPolicy(current, undefined)).toBe(current);
    expect(withOrderPolicy(current, { paymentHours: 12, lateFeeMultiplier: Number.NaN })).toEqual({
      ...current,
      paymentHours: 12,
    });
  });
});

describe('Rental orders keep the settings they were created with (GB-38)', () => {
  let app: any;
  let clock: FakeClock;
  let ownerAuth: Record<string, string>;
  let renterId: string;
  let renterAuth: Record<string, string>;
  let toyId: string;

  const create = (startDate: string, endDate: string) =>
    request(app).post('/api/v1/rentals').set(renterAuth).send({ toyId, startDate, endDate });
  const accept = (orderId: string) =>
    request(app).post(`/api/v1/rentals/${orderId}/accept`).set(ownerAuth);

  beforeEach(async () => {
    await resetDatabase();
    clock = new FakeClock('2026-11-01T03:00:00Z');
    app = buildRentalApp(clock).app;
    const owner = await createUser();
    ownerAuth = authHeader(owner.id);
    const renter = await createUser();
    renterId = renter.id;
    renterAuth = authHeader(renterId);
    toyId = (await createRentToy(owner.id)).id;
  });

  it('copies the time limits and the late fee multiplier onto a new order', async () => {
    await setSettings({ 'rental.paymentHours': '6', 'rental.lateFeeMultiplier': '1.5' });
    const res = await create('2026-11-05', '2026-11-07');
    expect(res.status).toBe(201);
    const order = await RentalOrder.findById(res.body.data.id).lean();
    expect(order?.policy).toEqual({
      ownerResponseHours: 24,
      paymentHours: 6,
      receiptAutoConfirmHours: 48,
      settlementHours: 48,
      returnReminderHours: 24,
      disputeReplyHours: 72,
      lateFeeMultiplier: 1.5,
    });
  });

  // R5.0 II.1: staging shortens the time limits to minutes to run the scheduled jobs.
  it('takes fractional hours: 0.1 hour to answer is 6 minutes, 0.04 hour to pay is 2 min 24 s', async () => {
    await setSettings({ 'rental.ownerResponseHours': '0.1', 'rental.paymentHours': '0.04' });
    const res = await create('2026-11-05', '2026-11-07');
    expect(res.status).toBe(201);
    const order = await RentalOrder.findById(res.body.data.id).lean();
    expect(order?.policy).toMatchObject({ ownerResponseHours: 0.1, paymentHours: 0.04 });
    expect(order?.timer?.dueAt?.toISOString()).toBe('2026-11-01T03:06:00.000Z');
    expect((await accept(res.body.data.id)).body.data.timer.dueAt).toBe('2026-11-01T03:02:24.000Z');
  });

  it('an older order keeps its fee, deadlines and late fee; a new one takes the new values', async () => {
    const older = (await create('2026-11-05', '2026-11-07')).body.data;
    expect(older.pricing).toMatchObject({ platformFeeRate: 0.1, platformFee: 15_000 });

    // The Admin changes the settings after the first request
    await setSettings({
      'rental.platformFeeRate': '0.2',
      'rental.paymentHours': '6',
      'rental.receiptAutoConfirmHours': '12',
      'rental.settlementHours': '24',
      'rental.lateFeeMultiplier': '2',
    });

    // New request: new rate in the quote and on the order, 6-hour payment window
    const quote = await request(app)
      .post('/api/v1/rentals/quote')
      .set(renterAuth)
      .send({ toyId, startDate: '2026-11-10', endDate: '2026-11-12' });
    expect(quote.body.data.pricing).toMatchObject({ platformFeeRate: 0.2, platformFee: 30_000 });
    const newer = (await create('2026-11-10', '2026-11-12')).body.data;
    expect(newer.pricing).toMatchObject({ platformFeeRate: 0.2, platformFee: 30_000 });
    expect((await accept(newer.id)).body.data.timer.dueAt).toBe(
      new Date(Date.parse('2026-11-01T03:00:00Z') + 6 * HOUR).toISOString(),
    );

    // Older request: still 10%, 12-hour payment window, 48-hour receipt, x1 late fee, 48-hour check
    const accepted = (await accept(older.id)).body.data;
    expect(accepted.pricing).toMatchObject({ platformFeeRate: 0.1, platformFee: 15_000 });
    expect(accepted.timer.dueAt).toBe('2026-11-01T15:00:00.000Z');
    await fund(renterId, 1_000_000);
    expect(
      (await request(app).post(`/api/v1/rentals/${older.id}/pay`).set(renterAuth)).status,
    ).toBe(200);
    const shipped = await request(app)
      .post(`/api/v1/rentals/${older.id}/ship`)
      .set(ownerAuth)
      .attach('photos', JPEG, 'ship.jpg');
    expect(shipped.body.data.timer.dueAt).toBe('2026-11-03T03:00:00.000Z');
    await request(app)
      .post(`/api/v1/rentals/${older.id}/receive`)
      .set(renterAuth)
      .attach('photos', JPEG, 'receive.jpg');
    // 2 days late: 2 × 50,000 × 1 (not × 2)
    clock.set('2026-11-09T03:00:00Z');
    const returned = await request(app)
      .post(`/api/v1/rentals/${older.id}/return`)
      .set(renterAuth)
      .attach('photos', JPEG, 'return.jpg');
    expect(returned.body.data.returnInfo).toMatchObject({ lateDays: 2, lateFee: 100_000 });
    expect(returned.body.data.timer.dueAt).toBe('2026-11-11T03:00:00.000Z');
  });

  it('an order created before UC30 (no copy) follows the latest settings, as before', async () => {
    const order = (await create('2026-11-05', '2026-11-07')).body.data;
    await RentalOrder.updateOne({ _id: order.id }, { $unset: { policy: 1 } });
    await setSettings({ 'rental.paymentHours': '6' });
    expect((await accept(order.id)).body.data.timer.dueAt).toBe('2026-11-01T09:00:00.000Z');
  });

  it('blocks a new request by the trust threshold and deposit limit saved by the Admin', async () => {
    const lowRenter = authHeader((await createUser({ trust: { score: 60 } })).id);
    const body = { toyId, startDate: '2026-11-05', endDate: '2026-11-07' };
    expect((await request(app).post('/api/v1/rentals').set(lowRenter).send(body)).status).toBe(201);
    await setSettings({ 'rental.minTrustScore': '70', 'rental.trustDepositLimit': '150000' });
    const blocked = await request(app)
      .post('/api/v1/rentals')
      .set(lowRenter)
      .send({ ...body, startDate: '2026-11-10', endDate: '2026-11-12' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('RENTER_RESTRICTED');
    // Deposit 200,000 ≤ a limit of 200,000: not blocked
    await setSettings({ 'rental.trustDepositLimit': '200000' });
    expect(
      (
        await request(app)
          .post('/api/v1/rentals')
          .set(lowRenter)
          .send({ ...body, startDate: '2026-11-10', endDate: '2026-11-12' })
      ).status,
    ).toBe(201);
  });
});

describe('Purchase orders keep the commission and deadlines they were created with (GB-38)', () => {
  const app = createApp();
  const service = new PurchaseOrderService(new WalletLedgerRepository());

  beforeEach(async () => {
    await resetDatabase();
  });

  async function buy(price = 200_000) {
    const seller = await createUser();
    const buyer = await createUser();
    const category =
      (await Category.findOne({ slug: 'ban-lai' })) ??
      (await Category.create({
        name: 'Bán lại',
        slug: 'ban-lai',
        status: 'active',
        displayOrder: 1,
      }));
    const toy = await Toy.create({
      ownerId: new mongoose.Types.ObjectId(seller.id),
      categoryId: category._id,
      title: 'Xe cứu hoả LEGO',
      description: 'Còn mới, đủ chi tiết và hộp.',
      condition: 'used_good',
      listingType: 'sell',
      priceOrRate: price,
      status: 'active',
      quantity: 1,
      bookingVersion: 0,
      ageRange: { minAge: 4, maxAge: 8 },
      images: [{ url: 'https://res.cloudinary.com/demo/toy.jpg', publicId: 'toy_1' }],
    });
    await fund(buyer.id, 500_000);
    const res = await request(app)
      .post('/api/v1/purchase-orders/buy-now')
      .set(authHeader(buyer.id))
      .send({
        toyId: toy.id,
        deliveryMethod: 'DELIVERY',
        recipientName: 'Người Mua',
        recipientPhone: '0912345678',
        province: 'Hà Nội',
        ward: 'Phường Cầu Giấy',
        street: '1 Trần Thái Tông',
      });
    expect(res.status).toBe(201);
    return { seller, buyer, toyId: toy.id as string, order: res.body.data };
  }

  it('reads commission, delivery fee and ship deadline at creation and keeps them', async () => {
    const before = Date.now();
    const older = await buy();
    expect(older.order.pricing).toMatchObject({
      platformFee: 10_000,
      platformFeeRate: 0.05,
      shippingFee: 30_000,
      totalPayable: 230_000,
    });
    expect(older.order.policy).toEqual({ shipDeadlineHours: 48, autoCompleteDays: 7 });

    await setSettings({
      'purchase.commissionRate': '0.1',
      'purchase.shippingFee': '20000',
      'purchase.shipDeadlineHours': '24',
      'purchase.autoCompleteDays': '3',
    });

    const quoteToy = await buy(300_000);
    expect(quoteToy.order.pricing).toMatchObject({
      platformFee: 30_000,
      platformFeeRate: 0.1,
      shippingFee: 20_000,
      totalPayable: 320_000,
      sellerNet: 290_000,
    });
    expect(quoteToy.order.policy).toEqual({ shipDeadlineHours: 24, autoCompleteDays: 3 });
    const dueNew = Date.parse(quoteToy.order.timer.dueAt);
    expect(dueNew - before).toBeGreaterThanOrEqual(24 * HOUR);
    expect(dueNew - Date.now()).toBeLessThanOrEqual(24 * HOUR);

    // Older order: shipped now → completes 7 days later; settles with its 5% commission
    const shipped = await request(app)
      .post(`/api/v1/purchase-orders/${older.order.id}/ship`)
      .set(authHeader(older.seller.id))
      .send({ carrierName: 'Viettel Post', trackingCode: 'VT1', photos: PHOTOS });
    const autoAt = Date.parse(shipped.body.data.timer.dueAt);
    expect(autoAt - Date.now()).toBeGreaterThan(7 * 24 * HOUR - 60_000);
    const received = await request(app)
      .post(`/api/v1/purchase-orders/${older.order.id}/receive`)
      .set(authHeader(older.buyer.id));
    expect(received.body.data.settlement).toMatchObject({
      platformFee: 10_000,
      sellerReceived: 220_000,
    });
    expect((await Wallet.findOne({ userId: older.seller.id }))?.balance).toBe(220_000);
  });

  it('cancels a new order after its own (shorter) ship deadline and names it in the messages', async () => {
    await setSettings({ 'purchase.shipDeadlineHours': '24' });
    const { order } = await buy();
    const bodies: string[] = [];
    const stop = domainEvents.subscribe('NOTIFY', (event) => {
      bodies.push(event.body);
    });
    try {
      // 23 hours: not due yet (the default would also wait); 25 hours: cancelled
      expect((await service.runDueTimers(new Date(Date.now() + 23 * HOUR))).cancelled).toBe(0);
      const result = await service.runDueTimers(new Date(Date.now() + 25 * HOUR));
      expect(result.cancelled).toBe(1);
    } finally {
      stop();
    }
    expect((await PurchaseOrder.findById(order.id))?.status).toBe('CANCELLED');
    expect(bodies.some((body) => body.includes('trong 24 giờ'))).toBe(true);
    expect(bodies.some((body) => body.includes('quá 24 giờ chưa gửi hàng'))).toBe(true);
    expect(bodies.some((body) => body.includes('48 giờ'))).toBe(false);
  });

  it('quotes with the commission and delivery fee in force', async () => {
    await setSettings({ 'purchase.commissionRate': '0.075', 'purchase.shippingFee': '0' });
    const { seller } = await buy();
    const toy = await Toy.findOne({ ownerId: seller.id });
    await Toy.updateOne({ _id: toy!._id }, { $set: { status: 'active', quantity: 1 } });
    const quote = await request(app)
      .post('/api/v1/purchase-orders/quote')
      .set(authHeader((await createUser()).id))
      .send({ toyId: toy!.id, deliveryMethod: 'DELIVERY' });
    expect(quote.status).toBe(200);
    expect(quote.body.data).toMatchObject({
      platformFee: 15_000,
      platformFeeRate: 0.075,
      shippingFee: 0,
      totalPayable: 200_000,
    });
  });
});

describe('Withdrawal limits from System Settings', () => {
  const app = createApp();
  const bankInfo = {
    bankName: 'Vietcombank',
    accountNumber: '0123456789',
    accountHolderName: 'Nguyen Van A',
  };

  beforeEach(async () => {
    await resetDatabase();
  });

  it('checks the minimum and maximum saved by the Admin, one step past each end', async () => {
    const user = await createUser();
    await fund(user.id, 50_000_000);
    const withdraw = (amount: number) =>
      request(app)
        .post('/api/v1/wallets/withdrawals')
        .set(authHeader(user.id))
        .send({ amount, bankInfo });

    await setSettings({ 'withdrawal.minAmount': '100000', 'withdrawal.maxAmount': '1000000' });
    const low = await withdraw(99_999);
    expect(low.status).toBe(400);
    expect(low.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'amount', message: 'Số tiền rút tối thiểu là 100.000 VNĐ.' }],
    });
    const high = await withdraw(1_000_001);
    expect(high.body.error.details[0].message).toBe(
      'Số tiền rút tối đa cho một lần là 1.000.000 VNĐ.',
    );
    expect((await withdraw(0)).status).toBe(400);
    expect((await withdraw(-5)).status).toBe(400);

    // A pending request keeps its amount when the limits change afterwards
    const ok = await withdraw(1_000_000);
    expect(ok.status).toBe(201);
    await setSettings({ 'withdrawal.maxAmount': '500000' });
    const mine = await request(app).get('/api/v1/wallets/withdrawals').set(authHeader(user.id));
    expect(mine.body.data.items[0]).toMatchObject({ amount: 1_000_000, status: 'pending' });
  });

  it('falls back to 50,000–20,000,000 when nothing valid is stored', async () => {
    const user = await createUser();
    await fund(user.id, 50_000_000);
    await setSettings({ 'withdrawal.minAmount': 'abc' });
    const res = await request(app)
      .post('/api/v1/wallets/withdrawals')
      .set(authHeader(user.id))
      .send({ amount: 49_999, bankInfo });
    expect(res.body.error.details[0].message).toBe('Số tiền rút tối thiểu là 50.000 VNĐ.');
    const over = await request(app)
      .post('/api/v1/wallets/withdrawals')
      .set(authHeader(user.id))
      .send({ amount: 20_000_001, bankInfo });
    expect(over.body.error.details[0].message).toBe(
      'Số tiền rút tối đa cho một lần là 20.000.000 VNĐ.',
    );
  });
});

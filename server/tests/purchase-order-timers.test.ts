import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Category, PurchaseOrder, Toy, Wallet, WalletTransaction } from '../src/models/index.js';
import { WalletLedgerRepository } from '../src/repositories/wallet-ledger.repository.js';
import {
  HAND_DELIVERY_CARRIER,
  PurchaseOrderService,
} from '../src/services/purchase-order.service.js';
import { authHeader, createUser, fund } from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

const PHOTOS = [{ url: 'https://res.cloudinary.com/demo/pack.jpg', publicId: 'pack_1' }];
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('Purchase orders: shipping evidence and deadlines', () => {
  const app = createApp();
  const service = new PurchaseOrderService(new WalletLedgerRepository());

  beforeAll(async () => {
    await startReplSet();
  });
  afterAll(async () => {
    await stopReplSet();
  });
  beforeEach(async () => {
    await resetDatabase();
  });

  const balance = async (filter: Record<string, unknown>) => (await Wallet.findOne(filter))?.balance ?? 0;

  async function buy(deliveryMethod: 'DELIVERY' | 'LOCAL_PICKUP' = 'DELIVERY', price = 200_000) {
    const seller = await createUser();
    const buyer = await createUser();
    const category =
      (await Category.findOne({ slug: 'ban-lai' })) ??
      (await Category.create({ name: 'Bán lại', slug: 'ban-lai', status: 'active', displayOrder: 1 }));
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
      .send(
        deliveryMethod === 'DELIVERY'
          ? { toyId: toy.id, deliveryMethod, recipientName: 'Người Mua', recipientPhone: '0912345678', province: 'Hà Nội', ward: 'Phường Cầu Giấy', street: '1 Trần Thái Tông' }
          : { toyId: toy.id, deliveryMethod },
      );
    expect(res.status).toBe(201);
    return { seller, buyer, toyId: toy.id as string, orderId: res.body.data.id as string, total: res.body.data.pricing.totalPayable as number };
  }

  const ship = (orderId: string, sellerId: string, body: Record<string, unknown>) =>
    request(app).post(`/api/v1/purchase-orders/${orderId}/ship`).set(authHeader(sellerId)).send(body);

  describe('POST /:orderId/ship evidence', () => {
    it('requires at least one packing photo', async () => {
      const { seller, orderId } = await buy();
      const res = await ship(orderId, seller.id, { carrierName: 'Viettel Post', trackingCode: 'VT1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SHIPPING_PHOTO_REQUIRED');
      expect((await PurchaseOrder.findById(orderId))?.status).toBe('PAID');
    });

    it('requires a tracking code when a carrier delivers', async () => {
      const { seller, orderId } = await buy();
      const res = await ship(orderId, seller.id, { carrierName: 'Viettel Post', photos: PHOTOS });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TRACKING_CODE_REQUIRED');
    });

    it('accepts no tracking code for hand delivery and for local pickup', async () => {
      const delivery = await buy('DELIVERY');
      const handed = await ship(delivery.orderId, delivery.seller.id, { carrierName: HAND_DELIVERY_CARRIER, photos: PHOTOS });
      expect(handed.status).toBe(200);
      expect(handed.body.data.status).toBe('SHIPPING');

      const pickup = await buy('LOCAL_PICKUP');
      const picked = await ship(pickup.orderId, pickup.seller.id, { carrierName: HAND_DELIVERY_CARRIER, photos: PHOTOS });
      expect(picked.status).toBe(200);
    });

    it('rejects more than 5 photos', async () => {
      const { seller, orderId } = await buy();
      const photos = Array.from({ length: 6 }, (_, i) => ({ url: `https://res.cloudinary.com/demo/p${i}.jpg` }));
      const res = await ship(orderId, seller.id, { carrierName: 'Viettel Post', trackingCode: 'VT1', photos });
      expect(res.status).toBe(400);
    });

    it('refuses to ship after the 48-hour deadline', async () => {
      const { seller, orderId } = await buy();
      await PurchaseOrder.updateOne({ _id: orderId }, { $set: { 'timer.dueAt': new Date(Date.now() - 1000) } });
      const res = await ship(orderId, seller.id, { carrierName: 'Viettel Post', trackingCode: 'VT1', photos: PHOTOS });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SHIP_DEADLINE_PASSED');
    });
  });

  describe('runDueTimers', () => {
    it('cancels an order not shipped in 48 hours, refunds the buyer and puts the toy back on sale', async () => {
      const { buyer, toyId, orderId, total } = await buy();
      expect(await balance({ userId: buyer.id })).toBe(500_000 - total);

      // Not due yet: nothing happens
      expect(await service.runDueTimers(new Date(Date.now() + 47 * HOUR))).toEqual({ cancelled: 0, autoCompleted: 0, failed: 0 });

      const result = await service.runDueTimers(new Date(Date.now() + 49 * HOUR));
      expect(result).toEqual({ cancelled: 1, autoCompleted: 0, failed: 0 });

      const order = await PurchaseOrder.findById(orderId);
      expect(order?.status).toBe('CANCELLED');
      expect(order?.cancelledAt).toBeDefined();
      expect(order?.timer?.dueAt).toBeUndefined();
      expect(await balance({ userId: buyer.id })).toBe(500_000);
      expect(await balance({ ownerType: 'escrow' })).toBe(0);
      const toy = await Toy.findById(toyId);
      expect(toy?.status).toBe('active');
      expect(toy?.quantity).toBe(1);

      // A second run does not refund twice
      expect(await service.runDueTimers(new Date(Date.now() + 50 * HOUR))).toEqual({ cancelled: 0, autoCompleted: 0, failed: 0 });
      expect(await WalletTransaction.countDocuments({ postingKey: `purchase_order_refund_${orderId}` })).toBe(2);

      // Someone else can now buy it
      const other = await createUser();
      await fund(other.id, 300_000);
      const again = await request(app)
        .post('/api/v1/purchase-orders/buy-now')
        .set(authHeader(other.id))
        .send({ toyId, deliveryMethod: 'LOCAL_PICKUP' });
      expect(again.status).toBe(201);
    });

    it('completes a shipped order the buyer did not confirm in 7 days and pays the seller', async () => {
      const { seller, toyId, orderId } = await buy('DELIVERY', 200_000);
      await ship(orderId, seller.id, { carrierName: 'Viettel Post', trackingCode: 'VT1', photos: PHOTOS }).expect(200);

      expect((await service.runDueTimers(new Date(Date.now() + 6 * DAY))).autoCompleted).toBe(0);
      const result = await service.runDueTimers(new Date(Date.now() + 7 * DAY + HOUR));
      expect(result).toEqual({ cancelled: 0, autoCompleted: 1, failed: 0 });

      const order = await PurchaseOrder.findById(orderId);
      expect(order?.status).toBe('COMPLETED');
      expect(order?.settlement?.autoSettled).toBe(true);
      expect(order?.settlement?.sellerReceived).toBe(220_000); // 200k + 30k phí giao − 10k hoa hồng
      expect(await balance({ userId: seller.id })).toBe(220_000);
      expect(await balance({ ownerType: 'platform' })).toBe(10_000);
      expect(await balance({ ownerType: 'escrow' })).toBe(0);
      const toy = await Toy.findById(toyId);
      expect(toy?.status).toBe('hidden');
      expect(toy?.quantity).toBe(0);
    });

    it('leaves a disputed order alone', async () => {
      const { seller, orderId } = await buy();
      await ship(orderId, seller.id, { carrierName: 'Viettel Post', trackingCode: 'VT1', photos: PHOTOS }).expect(200);
      await PurchaseOrder.updateOne({ _id: orderId }, { $set: { status: 'DISPUTING' } });

      expect(await service.runDueTimers(new Date(Date.now() + 8 * DAY))).toEqual({ cancelled: 0, autoCompleted: 0, failed: 0 });
      expect((await PurchaseOrder.findById(orderId))?.status).toBe('DISPUTING');
    });
  });
});

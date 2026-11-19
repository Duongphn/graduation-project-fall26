import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Category, PurchaseOrder, Toy, Wallet } from '../src/models/index.js';
import { authHeader, createUser, fund } from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('Purchase Order Deliver & Receive API', () => {
  const app = createApp();

  beforeAll(async () => {
    await startReplSet();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function createSellToy(ownerId: string, price = 200_000) {
    let category = await Category.findOne();
    if (!category) {
      category = await Category.create({
        name: 'Đồ chơi bán lại',
        slug: 'do-choi-ban-lai',
        status: 'active',
        displayOrder: 1,
      });
    }

    return Toy.create({
      ownerId: new mongoose.Types.ObjectId(ownerId),
      categoryId: category._id,
      title: 'Bộ đồ chơi Lego Siêu Xe',
      description: 'Lego chính hãng còn mới 95%, đầy đủ hộp và sách hướng dẫn',
      condition: 'used_good',
      listingType: 'sell',
      priceOrRate: price,
      status: 'active',
      quantity: 1,
      bookingVersion: 0,
      ageRange: { minAge: 6, maxAge: 12 },
      images: [
        {
          url: 'https://res.cloudinary.com/demo/lego.jpg',
          publicId: 'lego_sample',
        },
      ],
    });
  }

  async function createPaidOrder(buyerId: string, sellerId: string, price = 200_000) {
    const toy = await createSellToy(sellerId, price);
    const shippingFee = 30_000;
    const totalPayable = price + shippingFee;

    // Nạp tiền cho người mua
    await fund(buyerId, totalPayable + 50_000);

    // Mua ngay qua API để tiền vào Escrow và tin bị khóa
    const buyRes = await request(app)
      .post('/api/v1/purchase-orders/buy-now')
      .set(authHeader(buyerId))
      .send({
        toyId: toy._id.toString(),
        deliveryMethod: 'DELIVERY',
        recipientName: 'Nguyễn Văn Mua',
        recipientPhone: '0912345678',
        province: 'Hà Nội',
        ward: 'Phường Bến Nghé',
        street: '123 Đường Cầu Giấy',
      });

    expect(buyRes.status).toBe(201);
    return {
      orderId: buyRes.body.data.id,
      code: buyRes.body.data.code,
      toyId: toy._id.toString(),
      price,
      shippingFee,
      totalPayable,
    };
  }

  describe('POST /api/v1/purchase-orders/:orderId/ship (Seller gửi hàng)', () => {
    it('từ chối nếu không phải người bán', async () => {
      const seller = await createUser();
      const buyer = await createUser();
      const stranger = await createUser();
      const order = await createPaidOrder(buyer.id, seller.id);

      const res = await request(app)
        .post(`/api/v1/purchase-orders/${order.orderId}/ship`)
        .set(authHeader(stranger.id))
        .send({
          carrierName: 'Giao Hàng Nhanh',
          trackingCode: 'GHN123456',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('từ chối nếu người mua cố tình gọi ship', async () => {
      const seller = await createUser();
      const buyer = await createUser();
      const order = await createPaidOrder(buyer.id, seller.id);

      const res = await request(app)
        .post(`/api/v1/purchase-orders/${order.orderId}/ship`)
        .set(authHeader(buyer.id))
        .send({
          carrierName: 'Giao Hàng Nhanh',
          trackingCode: 'GHN123456',
        });

      expect(res.status).toBe(403);
    });

    it('seller xác nhận gửi hàng thành công, cập nhật SHIPPING và thông tin vận đơn', async () => {
      const seller = await createUser();
      const buyer = await createUser();
      const order = await createPaidOrder(buyer.id, seller.id);

      const res = await request(app)
        .post(`/api/v1/purchase-orders/${order.orderId}/ship`)
        .set(authHeader(seller.id))
        .send({
          carrierName: 'Giao Hàng Tiết Kiệm',
          trackingCode: 'GHTK-HN-998877',
          photos: [
            {
              url: 'https://res.cloudinary.com/demo/shipping-box.jpg',
              publicId: 'box_123',
            },
          ],
          note: 'Đã giao cho bưu tá tại bưu cục Cầu Giấy',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SHIPPING');
      expect(res.body.data.shippingInfo.carrierName).toBe('Giao Hàng Tiết Kiệm');
      expect(res.body.data.shippingInfo.trackingCode).toBe('GHTK-HN-998877');
      expect(res.body.data.shippingInfo.photos).toHaveLength(1);
      expect(res.body.data.shippedAt).toBeDefined();
      expect(res.body.data.timer.dueAt).toBeDefined();

      // Kiểm tra DB
      const orderInDb = await PurchaseOrder.findById(order.orderId);
      expect(orderInDb?.status).toBe('SHIPPING');
      expect(orderInDb?.shippingInfo?.trackingCode).toBe('GHTK-HN-998877');
    });
  });

  describe('POST /api/v1/purchase-orders/:orderId/receive (Buyer nhận & hài lòng)', () => {
    it('từ chối nếu đơn chưa ở trạng thái SHIPPING (vẫn đang PAID)', async () => {
      const seller = await createUser();
      const buyer = await createUser();
      const order = await createPaidOrder(buyer.id, seller.id);

      const res = await request(app)
        .post(`/api/v1/purchase-orders/${order.orderId}/receive`)
        .set(authHeader(buyer.id))
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ORDER_STATUS');
    });

    it('từ chối nếu không phải người mua bấm nhận hàng', async () => {
      const seller = await createUser();
      const buyer = await createUser();
      const order = await createPaidOrder(buyer.id, seller.id);

      // Seller ship trước
      await request(app)
        .post(`/api/v1/purchase-orders/${order.orderId}/ship`)
        .set(authHeader(seller.id))
        .send({ carrierName: 'Viettel Post', trackingCode: 'VT123' });

      // Seller cố bấm receive
      const res = await request(app)
        .post(`/api/v1/purchase-orders/${order.orderId}/receive`)
        .set(authHeader(seller.id))
        .send();

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('buyer xác nhận Đã nhận & Hài lòng: chuyển COMPLETED, chuyển tiền trừ hoa hồng 5% cho Seller, tin đồ chơi Sold', async () => {
      const seller = await createUser();
      const buyer = await createUser();
      const price = 200_000;
      const order = await createPaidOrder(buyer.id, seller.id, price);

      // 1. Seller xác nhận gửi hàng
      await request(app)
        .post(`/api/v1/purchase-orders/${order.orderId}/ship`)
        .set(authHeader(seller.id))
        .send({ carrierName: 'Viettel Post', trackingCode: 'VT12345678' });

      // Kiểm tra số dư ví seller trước khi nhận
      const sellerWalletBefore = await Wallet.findOne({ userId: seller.id });
      const sellerBalanceBefore = sellerWalletBefore?.balance ?? 0;

      // 2. Buyer bấm "Đã nhận & Hài lòng"
      const res = await request(app)
        .post(`/api/v1/purchase-orders/${order.orderId}/receive`)
        .set(authHeader(buyer.id))
        .send({ note: 'Đồ chơi rất đẹp, đúng như hình' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.completedAt).toBeDefined();
      expect(res.body.data.settlement).toBeDefined();

      const platformFee = Math.round(price * 0.05); // 10.000 VNĐ
      const expectedSellerNet = price - platformFee; // 190.000 VNĐ (tiền hàng trừ 5% hoa hồng)

      expect(res.body.data.settlement.platformFee).toBe(platformFee);
      expect(res.body.data.settlement.sellerReceived).toBe(expectedSellerNet);

      // 3. Kiểm tra số dư ví seller đã được cộng sellerNet
      const sellerWalletAfter = await Wallet.findOne({ userId: seller.id });
      expect(sellerWalletAfter?.balance).toBe(sellerBalanceBefore + expectedSellerNet);

      // 4. Kiểm tra tin đăng đồ chơi đã bị ẩn / hết hàng (Sold)
      const toyInDb = await Toy.findById(order.toyId);
      expect(toyInDb?.status).toBe('hidden');
      expect(toyInDb?.quantity).toBe(0);

      // 5. Kiểm tra Escrow ví không còn giữ khoản này
      const buyerWalletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set(authHeader(buyer.id));
      expect(buyerWalletRes.body.data.holdings.purchases).toBe(0);
    });
  });
});

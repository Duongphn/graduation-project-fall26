import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Category, PurchaseOrder, Toy } from '../src/models/index.js';
import { authHeader, createRentToy, createUser, fund } from './helpers/rental-fixtures.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('Purchase Order Buy Now API', () => {
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

  async function createSellToy(ownerId: string, price = 200_000, quantity = 1) {
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
      quantity,
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

  describe('POST /api/v1/purchase-orders/quote', () => {
    it('báo giá chính xác cho đơn giao hàng tận nơi (DELIVERY)', async () => {
      const seller = await createUser();
      const toy = await createSellToy(seller.id, 250_000);

      const res = await request(app)
        .post('/api/v1/purchase-orders/quote')
        .send({
          toyId: toy.id,
          deliveryMethod: 'DELIVERY',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.itemPrice).toBe(250_000);
      expect(res.body.data.shippingFee).toBe(30_000);
      expect(res.body.data.platformFee).toBe(12_500); // 5% of 250k
      expect(res.body.data.totalPayable).toBe(280_000); // 250k + 30k
      expect(res.body.data.sellerNet).toBe(267_500); // 250k + 30k phí giao - 12.5k
    });

    it('báo giá chính xác khi người mua tự đến lấy (LOCAL_PICKUP - phí giao 0đ)', async () => {
      const seller = await createUser();
      const toy = await createSellToy(seller.id, 100_000);

      const res = await request(app)
        .post('/api/v1/purchase-orders/quote')
        .send({
          toyId: toy.id,
          deliveryMethod: 'LOCAL_PICKUP',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.shippingFee).toBe(0);
      expect(res.body.data.totalPayable).toBe(100_000);
    });
  });

  describe('POST /api/v1/purchase-orders/buy-now', () => {
    it('chặn người mua nếu chưa đăng nhập', async () => {
      const seller = await createUser();
      const toy = await createSellToy(seller.id);

      const res = await request(app)
        .post('/api/v1/purchase-orders/buy-now')
        .send({
          toyId: toy.id,
          deliveryMethod: 'LOCAL_PICKUP',
        });

      expect(res.status).toBe(401);
    });

    it('chặn người bán tự mua đồ chơi của chính mình', async () => {
      const seller = await createUser();
      const toy = await createSellToy(seller.id);
      await fund(seller.id, 500_000);

      const res = await request(app)
        .post('/api/v1/purchase-orders/buy-now')
        .set(authHeader(seller.id))
        .send({
          toyId: toy.id,
          deliveryMethod: 'LOCAL_PICKUP',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANNOT_BUY_OWN_TOY');
    });

    it('báo lỗi khi số dư ví người mua không đủ', async () => {
      const seller = await createUser();
      const buyer = await createUser();
      const toy = await createSellToy(seller.id, 200_000);
      await fund(buyer.id, 50_000); // Chỉ có 50k, cần 200k + 30k = 230k

      const res = await request(app)
        .post('/api/v1/purchase-orders/buy-now')
        .set(authHeader(buyer.id))
        .send({
          toyId: toy.id,
          deliveryMethod: 'DELIVERY',
          recipientName: 'Nguyễn Văn Mua',
          recipientPhone: '0987654321',
          province: 'Hà Nội',
          ward: 'Dịch Vọng Hậu',
          street: '144 Xuân Thủy',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_WALLET_BALANCE');
    });

    it('mua ngay thành công: khóa tin đồ chơi, trừ ví vào Escrow, tạo đơn PAID', async () => {
      const seller = await createUser();
      const buyer = await createUser();
      const toy = await createSellToy(seller.id, 200_000);
      // Nạp 300k vào ví người mua
      await fund(buyer.id, 300_000);

      const res = await request(app)
        .post('/api/v1/purchase-orders/buy-now')
        .set(authHeader(buyer.id))
        .send({
          toyId: toy.id,
          deliveryMethod: 'DELIVERY',
          recipientName: 'Nguyễn Văn A',
          recipientPhone: '0912345678',
          province: 'TP. Hồ Chí Minh',
          ward: 'Bến Nghé',
          street: '123 Lê Lợi',
          notes: 'Giao giờ hành chính',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PAID');
      expect(res.body.data.pricing.totalPayable).toBe(230_000); // 200k + 30k ship
      expect(res.body.data.code).toMatch(/^PO\d{6}-[0-9A-Z]{5}$/);

      // 1. Kiểm tra đồ chơi đã bị khóa chống bán trùng
      const updatedToy = await Toy.findById(toy.id);
      expect(updatedToy?.status).toBe('hidden');
      expect(updatedToy?.quantity).toBe(0);

      // 2. Kiểm tra số dư ví người mua: 300k - 230k = 70k khả dụng, 230k đang tạm giữ
      const walletRes = await request(app)
        .get('/api/v1/wallets/me')
        .set(authHeader(buyer.id));

      expect(walletRes.status).toBe(200);
      expect(walletRes.body.data.availableBalance).toBe(70_000);
      expect(walletRes.body.data.holdingBalance).toBe(230_000);
      expect(walletRes.body.data.holdings.purchases).toBe(230_000);

      // 3. Người thứ 2 cố mua cùng món này sẽ bị chặn 409
      const buyer2 = await createUser();
      await fund(buyer2.id, 500_000);

      const res2 = await request(app)
        .post('/api/v1/purchase-orders/buy-now')
        .set(authHeader(buyer2.id))
        .send({
          toyId: toy.id,
          deliveryMethod: 'LOCAL_PICKUP',
        });

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe('TOY_ALREADY_SOLD');
    });
  });

  describe('POST /api/v1/purchase-orders/buy-now: GB-06, wrong toy, phone form', () => {
    const delivery = {
      deliveryMethod: 'DELIVERY',
      recipientName: 'Nguyễn Văn A',
      province: 'TP. Hồ Chí Minh',
      ward: 'Bến Nghé',
      street: '123 Lê Lợi',
    };

    it.each(['unverified', 'pending', 'rejected'])(
      'GB-06: tài khoản %s không mua được, ví và tin không đổi',
      async (verificationStatus) => {
        const seller = await createUser();
        const buyer = await createUser({ verificationStatus });
        const toy = await createSellToy(seller.id, 100_000);
        await fund(buyer.id, 500_000);

        const res = await request(app)
          .post('/api/v1/purchase-orders/buy-now')
          .set(authHeader(buyer.id))
          .send({ toyId: toy.id, deliveryMethod: 'LOCAL_PICKUP' });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('USER_NOT_VERIFIED');
        expect(await PurchaseOrder.countDocuments()).toBe(0);
        const after = await Toy.findById(toy.id);
        expect(after?.status).toBe('active');
        expect(after?.quantity).toBe(1);
      },
    );

    it('tin cho thuê: 400 INVALID_LISTING_TYPE như /quote, tin không bị khoá', async () => {
      const owner = await createUser();
      const buyer = await createUser();
      const rentToy = await createRentToy(owner._id);
      await fund(buyer.id, 500_000);

      const res = await request(app)
        .post('/api/v1/purchase-orders/buy-now')
        .set(authHeader(buyer.id))
        .send({ toyId: rentToy.id, deliveryMethod: 'LOCAL_PICKUP' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_LISTING_TYPE');
      expect((await Toy.findById(rentToy.id))?.status).toBe('active');
    });

    it('toyId không tồn tại hoặc tin chưa duyệt: 404 TOY_NOT_FOUND', async () => {
      const seller = await createUser();
      const buyer = await createUser();
      const pending = await createSellToy(seller.id);
      await Toy.updateOne({ _id: pending._id }, { $set: { status: 'pending' } });
      await fund(buyer.id, 500_000);

      for (const toyId of [new mongoose.Types.ObjectId().toString(), pending.id]) {
        const res = await request(app)
          .post('/api/v1/purchase-orders/buy-now')
          .set(authHeader(buyer.id))
          .send({ toyId, deliveryMethod: 'LOCAL_PICKUP' });
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('TOY_NOT_FOUND');
      }
    });

    it.each([
      ['+84 933 000 003', '0933000003'],
      ['+84933000003', '0933000003'],
      ['84933000003', '0933000003'],
      ['0933.000.003', '0933000003'],
      ['  0933-000-003  ', '0933000003'],
      ['0933000003', '0933000003'],
    ])('SĐT người nhận "%s" được lưu dạng %s', async (typed, stored) => {
      const seller = await createUser();
      const buyer = await createUser();
      const toy = await createSellToy(seller.id, 100_000);
      await fund(buyer.id, 500_000);

      const res = await request(app)
        .post('/api/v1/purchase-orders/buy-now')
        .set(authHeader(buyer.id))
        .send({ toyId: toy.id, ...delivery, recipientPhone: typed });

      expect(res.status).toBe(201);
      expect(res.body.data.deliveryInfo.recipientPhone).toBe(stored);
      const order = await PurchaseOrder.findById(res.body.data.id).lean();
      expect(order?.deliveryInfo?.recipientPhone).toBe(stored);
    });

    it.each(['0933 000', '+85 933 000 003', '09330000031', '0|33000003'])(
      'SĐT người nhận sai "%s": 400, không tạo đơn',
      async (typed) => {
        const seller = await createUser();
        const buyer = await createUser();
        const toy = await createSellToy(seller.id, 100_000);
        await fund(buyer.id, 500_000);

        const res = await request(app)
          .post('/api/v1/purchase-orders/buy-now')
          .set(authHeader(buyer.id))
          .send({ toyId: toy.id, ...delivery, recipientPhone: typed });

        expect(res.status).toBe(400);
        expect(await PurchaseOrder.countDocuments()).toBe(0);
      },
    );
  });

  describe('GET /api/v1/purchase-orders/mine and /:orderId', () => {
    it('cho phép xem danh sách đơn đã mua và chi tiết đơn hàng', async () => {
      const seller = await createUser();
      const buyer = await createUser();
      const toy = await createSellToy(seller.id, 150_000);
      await fund(buyer.id, 200_000);

      const buyRes = await request(app)
        .post('/api/v1/purchase-orders/buy-now')
        .set(authHeader(buyer.id))
        .send({
          toyId: toy.id,
          deliveryMethod: 'LOCAL_PICKUP',
        });

      const orderId = buyRes.body.data.id;

      // Danh sách đơn mua của người mua
      const listRes = await request(app)
        .get('/api/v1/purchase-orders/mine')
        .set(authHeader(buyer.id));

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.total).toBe(1);
      expect(listRes.body.data.items[0].id).toBe(orderId);

      // Chi tiết đơn
      const detailRes = await request(app)
        .get(`/api/v1/purchase-orders/${orderId}`)
        .set(authHeader(buyer.id));

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.code).toBe(buyRes.body.data.code);
      expect(detailRes.body.data.pricing.itemPrice).toBe(150_000);
    });
  });
});

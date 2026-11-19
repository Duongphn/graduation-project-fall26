import { type ClientSession, type Model, Types } from 'mongoose';
import { type RequestActor } from '../types/request-actor.js';
import { type WalletLedgerPort } from '../interfaces/wallet.ports.js';
import {
  type IPurchaseOrder,
  PurchaseOrder,
} from '../models/purchase-order.model.js';
import { Toy, type ToyDocument } from '../models/toy.model.js';
import { User } from '../models/user.model.js';
import { withTransaction } from '../repositories/transaction.js';
import { AppError } from '../utils/app-error.js';
import { notify } from '../utils/notify.js';
import {
  type ConfirmReceivedInput,
  type ConfirmShippingInput,
  type CreateBuyNowInput,
  type QuotePurchasePricingInput,
} from '../validations/purchase-order.validation.js';

export interface PurchasePricingQuote {
  toyId: string;
  title: string;
  toyImage?: string | undefined;
  sellerId: string;
  sellerName?: string | undefined;
  deliveryMethod: string;
  itemPrice: number;
  shippingFee: number;
  platformFee: number;
  totalPayable: number;
  sellerNet: number;
}

export interface PurchaseOrderDto {
  id: string;
  code: string;
  buyerId: string;
  sellerId: string;
  toyId: string;
  itemDetails: {
    title: string;
    condition?: string | undefined;
    image?: string | undefined;
  };
  deliveryMethod: string;
  deliveryInfo?: {
    recipientName: string;
    recipientPhone: string;
    province?: string | undefined;
    district?: string | undefined;
    ward?: string | undefined;
    street?: string | undefined;
    notes?: string | undefined;
  } | undefined;
  shippingInfo?: {
    carrierName: string;
    trackingCode?: string | undefined;
    photos?: Array<{ url: string; publicId?: string | undefined }> | undefined;
    shippedAt?: string | undefined;
    note?: string | undefined;
  } | undefined;
  pricing: {
    itemPrice: number;
    shippingFee: number;
    platformFee: number;
    totalPayable: number;
    sellerNet: number;
  };
  status: string;
  paidAt?: string | undefined;
  shippedAt?: string | undefined;
  completedAt?: string | undefined;
  settlement?: {
    settledAt: string;
    sellerReceived: number;
    platformFee: number;
    autoSettled?: boolean | undefined;
  } | undefined;
  timer?: {
    dueAt?: string | undefined;
  } | undefined;
  createdAt: string;
}

const CODE_CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generatePurchaseCode(now: Date): string {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  let rand = '';
  for (let i = 0; i < 5; i++) {
    rand += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return `PO${yy}${mm}${dd}-${rand}`;
}

export class PurchaseOrderService {
  private readonly ledger: WalletLedgerPort;
  private readonly toyModel: Model<ToyDocument>;
  private readonly purchaseOrderModel: Model<IPurchaseOrder>;

  public constructor(
    ledger: WalletLedgerPort,
    toyModel: Model<ToyDocument> = Toy as unknown as Model<ToyDocument>,
    purchaseOrderModel: Model<IPurchaseOrder> = PurchaseOrder,
  ) {
    this.ledger = ledger;
    this.toyModel = toyModel;
    this.purchaseOrderModel = purchaseOrderModel;
  }

  /**
   * Báo giá tính tiền mua ngay và phí giao hàng trước khi thanh toán
   */
  public async quotePricing(input: QuotePurchasePricingInput): Promise<PurchasePricingQuote> {
    const toy = await this.toyModel.findById(input.toyId).lean();
    if (!toy || toy.status !== 'active') {
      throw new AppError(404, 'TOY_NOT_FOUND', 'Món đồ chơi không tồn tại hoặc đã bị ẩn.');
    }

    if (toy.listingType !== 'sell') {
      throw new AppError(400, 'INVALID_LISTING_TYPE', 'Món đồ chơi này không phải là bài đăng bán lại.');
    }

    if (toy.quantity < 1) {
      throw new AppError(409, 'TOY_OUT_OF_STOCK', 'Món đồ chơi đã được bán hoặc không còn sẵn.');
    }

    const itemPrice = toy.priceOrRate;
    const shippingFee = input.deliveryMethod === 'LOCAL_PICKUP' ? 0 : 30_000;
    const platformFeeRate = 0.05; // Phí sàn 5% khấu trừ từ người bán
    const platformFee = Math.round(itemPrice * platformFeeRate);
    const totalPayable = itemPrice + shippingFee;
    const sellerNet = itemPrice - platformFee;

    const seller = await User.findById(toy.ownerId).select('fullName phone').lean();

    return {
      toyId: toy._id.toString(),
      title: toy.title,
      toyImage: toy.images?.[0]?.url,
      sellerId: toy.ownerId.toString(),
      sellerName: seller?.fullName,
      deliveryMethod: input.deliveryMethod,
      itemPrice,
      shippingFee,
      platformFee,
      totalPayable,
      sellerNet,
    };
  }

  /**
   * Mua ngay: Khóa tin chống bán trùng + Thanh toán ví vào Escrow + Chuyển đơn sang PAID
   */
  public async buyNow(actor: RequestActor, input: CreateBuyNowInput): Promise<PurchaseOrderDto> {
    const now = new Date();

    const result = await withTransaction(async (session: ClientSession) => {
      // 1. Atomic Lock món đồ chơi: chuyển status sang hidden và giảm quantity
      const lockedToy = await this.toyModel.findOneAndUpdate(
        {
          _id: new Types.ObjectId(input.toyId),
          listingType: 'sell',
          status: 'active',
          quantity: { $gte: 1 },
        },
        {
          $set: { status: 'hidden' },
          $inc: { quantity: -1, bookingVersion: 1 },
        },
        { session, new: true },
      );

      if (!lockedToy) {
        throw new AppError(
          409,
          'TOY_ALREADY_SOLD',
          'Món đồ chơi này đã có người đặt mua trước hoặc không còn khả dụng.',
        );
      }

      if (lockedToy.ownerId.toString() === actor.userId) {
        throw new AppError(
          400,
          'CANNOT_BUY_OWN_TOY',
          'Bạn không thể tự mua món đồ chơi do chính mình đăng bán.',
        );
      }

      // 2. Tính toán giá & phí giao
      const itemPrice = lockedToy.priceOrRate;
      const shippingFee = input.deliveryMethod === 'LOCAL_PICKUP' ? 0 : 30_000;
      const platformFee = Math.round(itemPrice * 0.05);
      const totalPayable = itemPrice + shippingFee;
      const sellerNet = itemPrice - platformFee;

      // 3. Kiểm tra số dư ví người mua & Lấy ví Escrow
      const [buyerWallet, escrowWallet] = await Promise.all([
        this.ledger.getOrCreateUserWallet(actor.userId, session),
        this.ledger.getOrCreateSystemWallet('escrow', session),
      ]);

      if (buyerWallet.balance < totalPayable) {
        throw new AppError(
          400,
          'INSUFFICIENT_WALLET_BALANCE',
          `Số dư ví không đủ. Cần thanh toán ${totalPayable.toLocaleString('vi-VN')} đ (số dư ví hiện tại: ${buyerWallet.balance.toLocaleString('vi-VN')} đ).`,
          {
            required: totalPayable,
            currentBalance: buyerWallet.balance,
            missing: totalPayable - buyerWallet.balance,
          },
        );
      }

      // 4. Tạo mã đơn hàng độc nhất
      const code = generatePurchaseCode(now);

      const parsedDetails = {
        title: lockedToy.title,
        condition: lockedToy.condition,
        image: lockedToy.images?.[0]?.url,
      };

      // 5. Tạo đơn PurchaseOrder với trạng thái PAID
      const dueAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48h để người bán gửi hàng
      const createdOrders = await this.purchaseOrderModel.create(
        [
          {
            code,
            buyerId: new Types.ObjectId(actor.userId),
            sellerId: lockedToy.ownerId,
            toyId: lockedToy._id,
            itemDetails: JSON.stringify(parsedDetails),
            price: totalPayable,
            deliveryMethod: input.deliveryMethod,
            deliveryInfo: {
              recipientName: input.recipientName || '',
              recipientPhone: input.recipientPhone || '',
              province: input.province,
              district: input.district,
              ward: input.ward,
              street: input.street,
              notes: input.notes,
            },
            pricing: {
              itemPrice,
              shippingFee,
              platformFee,
              totalPayable,
              sellerNet,
            },
            status: 'PAID',
            paidAt: now,
            timer: { dueAt },
          },
        ],
        { session },
      );

      const orderDoc = createdOrders[0];
      if (!orderDoc) {
        throw new AppError(500, 'CREATE_ORDER_FAILED', 'Không thể khởi tạo đơn mua hàng.');
      }

      // 6. Thực hiện bút toán kép Ledger: Trừ ví người mua -> Chuyển vào Ví Escrow
      await this.ledger.post(
        `purchase_order_pay_${orderDoc._id.toString()}`,
        { kind: 'purchase_order', id: orderDoc._id.toString() },
        [
          { walletId: buyerWallet.id, amount: -totalPayable },
          { walletId: escrowWallet.id, amount: totalPayable },
        ],
        session,
        `Thanh toán mua đồ chơi đơn #${orderDoc.code} vào Escrow`,
      );

      return {
        order: orderDoc,
        toy: lockedToy,
      };
    });

    const { order, toy } = result;

    // 7. Gửi thông báo Domain Event sau khi transaction đã commit thành công
    notify({
      type: 'PURCHASE_ORDER',
      to: [toy.ownerId.toString()],
      title: 'Đơn mua mới đã thanh toán',
      body: `Người mua đã thanh toán đơn hàng ${order.code} vào Escrow sàn. Vui lòng chuẩn bị và giao hàng sớm.`,
      link: `/purchases/${order._id.toString()}`,
      actorId: actor.userId,
    });

    notify({
      type: 'PURCHASE_ORDER',
      to: [actor.userId],
      title: 'Mua đồ chơi thành công',
      body: `Đơn mua ${order.code} đã thanh toán thành công vào Escrow. ToyFlow đang giữ tiền an toàn cho bạn.`,
      link: `/purchases/${order._id.toString()}`,
      actorId: actor.userId,
    });

    return this.toDto(order);
  }

  /**
   * Lấy chi tiết đơn mua
   */
  public async getOrderDetail(actor: RequestActor, orderId: string): Promise<PurchaseOrderDto> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new AppError(400, 'INVALID_ORDER_ID', 'Mã đơn hàng không hợp lệ.');
    }

    const order = await this.purchaseOrderModel.findById(orderId).lean();
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
    }

    const isBuyer = order.buyerId.toString() === actor.userId;
    const isSeller = order.sellerId.toString() === actor.userId;
    const isAdmin = actor.actorType === 'ADMIN';

    if (!isBuyer && !isSeller && !isAdmin) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền truy cập đơn hàng này.');
    }

    return this.toDto(order as unknown as IPurchaseOrder);
  }

  /**
   * Danh sách đơn mua của tôi (Tôi là người mua)
   */
  public async listMyPurchases(
    actor: RequestActor,
    page = 1,
    limit = 10,
  ): Promise<{ items: PurchaseOrderDto[]; total: number; page: number; limit: number }> {
    const filter = { buyerId: new Types.ObjectId(actor.userId) };
    const skip = (Math.max(1, page) - 1) * limit;

    const [items, total] = await Promise.all([
      this.purchaseOrderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.purchaseOrderModel.countDocuments(filter),
    ]);

    return {
      items: (items as unknown as IPurchaseOrder[]).map((doc) => this.toDto(doc)),
      total,
      page,
      limit,
    };
  }

  /**
   * Danh sách đơn bán của tôi (Tôi là người bán)
   */
  public async listMySales(
    actor: RequestActor,
    page = 1,
    limit = 10,
  ): Promise<{ items: PurchaseOrderDto[]; total: number; page: number; limit: number }> {
    const filter = { sellerId: new Types.ObjectId(actor.userId) };
    const skip = (Math.max(1, page) - 1) * limit;

    const [items, total] = await Promise.all([
      this.purchaseOrderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.purchaseOrderModel.countDocuments(filter),
    ]);

    return {
      items: (items as unknown as IPurchaseOrder[]).map((doc) => this.toDto(doc)),
      total,
      page,
      limit,
    };
  }

  /**
   * Seller xác nhận gửi hàng (PAID -> SHIPPING)
   * Lưu ảnh đóng gói + mã vận đơn + đặt timer tự động nhận hàng
   */
  public async confirmShipping(
    actor: RequestActor,
    orderId: string,
    input: ConfirmShippingInput,
  ): Promise<PurchaseOrderDto> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new AppError(400, 'INVALID_ORDER_ID', 'Mã đơn hàng không hợp lệ.');
    }

    const order = await this.purchaseOrderModel.findById(orderId);
    if (!order) {
      throw new AppError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
    }

    if (order.sellerId.toString() !== actor.userId && actor.actorType !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Chỉ người bán mới có quyền xác nhận gửi hàng.');
    }

    if (order.status !== 'PAID') {
      throw new AppError(
        400,
        'INVALID_ORDER_STATUS',
        `Không thể gửi hàng cho đơn đang ở trạng thái ${order.status}. Đơn phải ở trạng thái PAID.`,
      );
    }

    const now = new Date();
    // 7 ngày tự động hoàn tất nếu người mua không bấm xác nhận và không khiếu nại
    const autoConfirmDueAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    order.status = 'SHIPPING';
    order.shippedAt = now;
    order.shippingInfo = {
      carrierName: input.carrierName,
      trackingCode: input.trackingCode,
      photos: input.photos,
      shippedAt: now,
      note: input.note,
    };
    order.timer = { dueAt: autoConfirmDueAt };

    await order.save();

    // Thông báo cho Người mua
    notify({
      type: 'PURCHASE_ORDER',
      to: [order.buyerId.toString()],
      title: 'Đơn hàng đang được giao',
      body: `Người bán đã gửi đơn hàng ${order.code} qua ${input.carrierName}${input.trackingCode ? ` (Mã vận đơn: ${input.trackingCode})` : ''}. Vui lòng theo dõi nhận hàng.`,
      link: `/purchases/${order._id.toString()}`,
      actorId: actor.userId,
    });

    return this.toDto(order);
  }

  /**
   * Buyer bấm "Đã nhận & Hài lòng" (SHIPPING -> COMPLETED)
   * Chuyển tiền từ Escrow cho Seller (trừ 5% hoa hồng) + Đánh dấu tin Sold
   */
  public async confirmReceived(
    actor: RequestActor,
    orderId: string,
    _input?: ConfirmReceivedInput,
  ): Promise<PurchaseOrderDto> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new AppError(400, 'INVALID_ORDER_ID', 'Mã đơn hàng không hợp lệ.');
    }

    const now = new Date();

    const updatedOrder = await withTransaction(async (session: ClientSession) => {
      const order = await this.purchaseOrderModel.findById(orderId).session(session);
      if (!order) {
        throw new AppError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
      }

      if (order.buyerId.toString() !== actor.userId && actor.actorType !== 'ADMIN') {
        throw new AppError(403, 'FORBIDDEN', 'Chỉ người mua mới có quyền xác nhận đã nhận hàng.');
      }

      if (order.status !== 'SHIPPING') {
        throw new AppError(
          400,
          'INVALID_ORDER_STATUS',
          `Chỉ có thể xác nhận nhận hàng khi đơn đang ở trạng thái SHIPPING (hiện tại: ${order.status}).`,
        );
      }

      const itemPrice = order.pricing?.itemPrice ?? order.price;
      const shippingFee = order.pricing?.shippingFee ?? 0;
      const platformFee = order.pricing?.platformFee ?? Math.round(itemPrice * 0.05);
      const totalPayable = order.pricing?.totalPayable ?? (itemPrice + shippingFee);
      const sellerNet = order.pricing?.sellerNet ?? (itemPrice - platformFee);
      const platformAmount = platformFee + shippingFee;

      // 1. Lấy ví escrow, ví người bán, ví platform
      const [escrowWallet, sellerWallet, platformWallet] = await Promise.all([
        this.ledger.getOrCreateSystemWallet('escrow', session),
        this.ledger.getOrCreateUserWallet(order.sellerId.toString(), session),
        this.ledger.getOrCreateSystemWallet('platform', session),
      ]);

      // 2. Bút toán quyết toán sổ cái kép: Escrow -(totalPayable), Seller +(sellerNet), Platform +(platformAmount)
      const ledgerEntries = [
        { walletId: escrowWallet.id, amount: -totalPayable },
        { walletId: sellerWallet.id, amount: sellerNet },
      ];
      if (platformAmount > 0) {
        ledgerEntries.push({ walletId: platformWallet.id, amount: platformAmount });
      }

      await this.ledger.post(
        `purchase_order_settle_${order._id.toString()}`,
        { kind: 'purchase_order', id: order._id.toString() },
        ledgerEntries,
        session,
        `Quyết toán tiền đơn mua đồ chơi #${order.code} cho người bán (đã trừ phí sàn 5%)`,
      );

      // 3. Cập nhật đơn hàng sang COMPLETED
      order.status = 'COMPLETED';
      order.completedAt = now;
      order.settlement = {
        settledAt: now,
        sellerReceived: sellerNet,
        platformFee,
        autoSettled: false,
      };
      order.timer = undefined;
      await order.save({ session });

      // 4. Khóa vĩnh viễn tin đăng đồ chơi (Đã bán)
      await this.toyModel.updateOne(
        { _id: order.toyId },
        { $set: { status: 'hidden', quantity: 0 } },
        { session },
      );

      return order;
    });

    const sellerNetAmount = updatedOrder.settlement?.sellerReceived ?? updatedOrder.price;

    // 5. Gửi thông báo sau khi commit transaction thành công
    notify({
      type: 'PURCHASE_ORDER',
      to: [updatedOrder.sellerId.toString()],
      title: 'Đơn hàng hoàn tất - Tiền đã vào ví',
      body: `Người mua đã xác nhận nhận hàng đơn ${updatedOrder.code}. Số tiền ${sellerNetAmount.toLocaleString('vi-VN')} đ đã được cộng vào ví của bạn.`,
      link: `/purchases/${updatedOrder._id.toString()}`,
      actorId: actor.userId,
    });

    notify({
      type: 'PURCHASE_ORDER',
      to: [actor.userId],
      title: 'Đơn mua đã hoàn tất',
      body: `Cảm ơn bạn đã xác nhận nhận hàng đơn ${updatedOrder.code}. Giao dịch đã kết thúc thành công!`,
      link: `/purchases/${updatedOrder._id.toString()}`,
      actorId: actor.userId,
    });

    return this.toDto(updatedOrder);
  }

  private toDto(doc: IPurchaseOrder): PurchaseOrderDto {
    let parsedItemDetails: { title: string; condition?: string; image?: string } = { title: 'Đồ chơi' };
    try {
      if (typeof doc.itemDetails === 'string') {
        parsedItemDetails = JSON.parse(doc.itemDetails);
      }
    } catch {
      parsedItemDetails = { title: doc.itemDetails || 'Đồ chơi' };
    }

    const deliveryInfo = doc.deliveryInfo
      ? {
          recipientName: doc.deliveryInfo.recipientName,
          recipientPhone: doc.deliveryInfo.recipientPhone,
          province: doc.deliveryInfo.province,
          district: doc.deliveryInfo.district,
          ward: doc.deliveryInfo.ward,
          street: doc.deliveryInfo.street,
          notes: doc.deliveryInfo.notes,
        }
      : undefined;

    const shippingInfo = doc.shippingInfo
      ? {
          carrierName: doc.shippingInfo.carrierName,
          trackingCode: doc.shippingInfo.trackingCode,
          photos: doc.shippingInfo.photos?.map((p) => ({ url: p.url, publicId: p.publicId })),
          shippedAt: doc.shippingInfo.shippedAt?.toISOString(),
          note: doc.shippingInfo.note,
        }
      : undefined;

    const settlement = doc.settlement
      ? {
          settledAt: doc.settlement.settledAt.toISOString(),
          sellerReceived: doc.settlement.sellerReceived,
          platformFee: doc.settlement.platformFee,
          autoSettled: doc.settlement.autoSettled,
        }
      : undefined;

    return {
      id: doc._id.toString(),
      code: doc.code,
      buyerId: doc.buyerId.toString(),
      sellerId: doc.sellerId.toString(),
      toyId: doc.toyId.toString(),
      itemDetails: parsedItemDetails,
      deliveryMethod: doc.deliveryMethod,
      deliveryInfo,
      shippingInfo,
      pricing: doc.pricing ?? {
        itemPrice: doc.price,
        shippingFee: 0,
        platformFee: 0,
        totalPayable: doc.price,
        sellerNet: doc.price,
      },
      status: doc.status,
      paidAt: doc.paidAt?.toISOString(),
      shippedAt: doc.shippedAt?.toISOString(),
      completedAt: doc.completedAt?.toISOString(),
      settlement,
      timer: doc.timer?.dueAt ? { dueAt: doc.timer.dueAt.toISOString() } : undefined,
      createdAt: doc.createdAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }
}

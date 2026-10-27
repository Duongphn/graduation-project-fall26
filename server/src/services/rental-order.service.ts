import mongoose, { type HydratedDocument, Types } from 'mongoose';
import { type RentalOrderStatus, type RentalTimerKind } from '../constants/rental-order-status.js';
import { type ToyImage } from '../interfaces/toy-listing.ports.js';
import { type RentalOrderDoc } from '../models/rental-order.model.js';
import { type IToy } from '../models/toy.model.js';
import { withTransaction } from '../repositories/transaction.js';
import {
  assertBookablePeriod,
  formatDateOnly,
  inclusiveDays,
  ownerResponseDue,
  parseDateOnly,
  paymentDue,
  receiptDue,
  returnReminderDue,
  settlementDue,
  suggestFreeRange,
  vnToday,
} from './rental-time.js';
import { toRentalOrderDto } from './rental-order.mapper.js';
import { computeLateFee, quotePricing } from './rental-pricing.js';
import {
  type RentalHistoryEntryDto,
  type RentalOrderDetailDto,
  type RentalOrderDto,
  type RentalQuoteDto,
  type RentalSettings,
} from '../types/rental-order.types.js';
import { type RequestActor } from '../types/request-actor.js';
import {
  type RentalListQuery,
  type RentalPeriodInput,
  type SettleRentalInput,
} from '../validations/rental-order.validation.js';
import { AppError } from '../utils/app-error.js';
import { validateToyImage } from '../utils/image-validation.js';
import { RentalOrderCore } from './rental-order-core.js';

export type { RentalOrderServiceDeps, TransitionParams } from './rental-order-core.js';

interface RentEligibility {
  toy: HydratedDocument<IToy>;
  settings: RentalSettings;
  startDate: Date;
  endDate: Date;
  now: Date;
}

/** Hành động do Renter/Owner gọi qua API (UC06–UC11). */
export class RentalOrderService extends RentalOrderCore {
  /** Như notifyParty: lỗi thông báo không được làm hỏng hành động đã commit. */
  private async notifyAdmins(title: string, body: string): Promise<void> {
    try {
      const admins = await this.userModel.find({ role: 'ADMIN' }).select('_id').lean();
      await Promise.all(
        admins.map((admin) =>
          this.notifier.notify({ userId: admin._id.toString(), title, body }).catch(() => {}),
        ),
      );
    } catch {
      // Swallows error
    }
  }

  public async loadForParty(
    actor: RequestActor,
    orderId: string,
    role: 'renter' | 'owner' | 'any',
  ): Promise<RentalOrderDoc> {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      throw new AppError(404, 'RENTAL_NOT_FOUND', 'Không tìm thấy đơn thuê.');
    }

    const order = await this.rentalOrderModel.findById(orderId);
    if (!order) {
      throw new AppError(404, 'RENTAL_NOT_FOUND', 'Không tìm thấy đơn thuê.');
    }

    const isRenter = order.renterId.toString() === actor.userId;
    const isOwner = order.ownerId.toString() === actor.userId;

    if (!isRenter && !isOwner) {
      throw new AppError(404, 'RENTAL_NOT_FOUND', 'Không tìm thấy đơn thuê.');
    }

    if (role === 'renter' && !isRenter) {
      throw new AppError(
        403,
        'FORBIDDEN_RENTAL_ACTION',
        'Chỉ người thuê mới có quyền thực hiện hành động này.',
      );
    }

    if (role === 'owner' && !isOwner) {
      throw new AppError(
        403,
        'FORBIDDEN_RENTAL_ACTION',
        'Chỉ chủ đồ chơi mới có quyền thực hiện hành động này.',
      );
    }

    return order;
  }

  /**
   * Kiểm tra UC06 bước 1–5 theo đúng thứ tự của spec; user, toy và settings được đọc song song.
   */
  private async assertCanRent(
    actor: RequestActor,
    input: RentalPeriodInput,
  ): Promise<RentEligibility> {
    const toyIdValid = mongoose.Types.ObjectId.isValid(input.toyId);
    const [user, toy, settings] = await Promise.all([
      this.userModel.findById(actor.userId).select('verificationStatus trust').lean(),
      toyIdValid ? this.toyModel.findById(input.toyId) : Promise.resolve(null),
      this.settings.getRentalSettings(),
    ]);

    if (!user || user.verificationStatus !== 'verified') {
      throw new AppError(403, 'USER_NOT_VERIFIED', 'Tài khoản chưa được xác thực danh tính.');
    }

    if (!toy || toy.status !== 'active' || toy.listingType !== 'rent') {
      throw new AppError(404, 'TOY_NOT_FOUND', 'Đồ chơi không tồn tại hoặc không khả dụng.');
    }

    if (toy.ownerId.toString() === actor.userId) {
      throw new AppError(403, 'CANNOT_RENT_OWN_LISTING', 'Không thể thuê đồ chơi của chính mình.');
    }

    const score = user.trust?.score;
    if (score !== undefined && score !== null && score < settings.minTrustScore) {
      throw new AppError(403, 'RENTER_RESTRICTED', 'Điểm tin cậy không đủ điều kiện thuê đồ chơi.');
    }

    const startDate = parseDateOnly(input.startDate);
    const endDate = parseDateOnly(input.endDate);
    if (!startDate || !endDate) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Ngày không đúng định dạng YYYY-MM-DD.');
    }

    const now = this.clock.now();
    assertBookablePeriod({ startDate, endDate }, now, settings);

    return { toy, settings, startDate, endDate, now };
  }

  public async quote(actor: RequestActor, input: RentalPeriodInput): Promise<RentalQuoteDto> {
    const { toy, settings, startDate, endDate } = await this.assertCanRent(actor, input);

    const conflicts = await this.repository.findOccupied(toy._id.toString(), startDate, endDate);
    const pricing = quotePricing(toy, { startDate, endDate }, settings);

    return {
      available: conflicts.length === 0,
      pricing,
      conflicts: conflicts.map((c) => ({
        startDate: formatDateOnly(c.startDate),
        endDate: formatDateOnly(c.endDate),
      })),
    };
  }

  public async create(actor: RequestActor, input: RentalPeriodInput): Promise<RentalOrderDto> {
    const { toy, settings, startDate, endDate, now } = await this.assertCanRent(actor, input);

    const orderDoc = await withTransaction(async (session) => {
      await this.toyModel.updateOne({ _id: toy._id }, { $inc: { bookingVersion: 1 } }, { session });

      const occupied = await this.repository.findOccupied(
        toy._id.toString(),
        startDate,
        endDate,
        session,
      );

      if (occupied.length > 0) {
        const windowStart = vnToday(now);
        const windowEnd = new Date(
          windowStart.getTime() + (settings.bookingWindowDays - 1) * 86_400_000,
        );
        const allOccupied = await this.repository.findOccupied(
          toy._id.toString(),
          windowStart,
          windowEnd,
          session,
        );
        const days = inclusiveDays({ startDate, endDate });
        const suggestion = suggestFreeRange(allOccupied, days, windowStart, windowEnd);

        throw new AppError(
          409,
          'RENTAL_DATES_UNAVAILABLE',
          'Khoảng thời gian đã có người đặt thuê.',
          {
            conflicts: occupied.map((c) => ({
              startDate: formatDateOnly(c.startDate),
              endDate: formatDateOnly(c.endDate),
            })),
            suggestion: suggestion
              ? {
                  startDate: formatDateOnly(suggestion.startDate),
                  endDate: formatDateOnly(suggestion.endDate),
                }
              : null,
          },
        );
      }

      const pricing = quotePricing(toy, { startDate, endDate }, settings);
      const dueAt = ownerResponseDue(now, startDate, settings);
      const code = this.repository.generateCode(now);

      const [order] = await this.rentalOrderModel.create(
        [
          {
            code,
            renterId: new Types.ObjectId(actor.userId),
            ownerId: toy.ownerId,
            toyId: toy._id,
            period: { startDate, endDate },
            pricing,
            status: 'PENDING',
            timer: { kind: 'OWNER_RESPONSE', dueAt },
          },
        ],
        { session },
      );

      if (!order) {
        throw new Error('Failed to create rental order');
      }

      await this.orderStatusHistoryModel.create(
        [
          {
            orderType: 'RENTAL',
            orderId: order._id,
            newStatus: 'PENDING',
            changedBy: new Types.ObjectId(actor.userId),
            notes: 'Tạo yêu cầu thuê',
          },
        ],
        { session },
      );

      return order;
    });

    await this.notifyParty(
      orderDoc,
      'owner',
      'Yêu cầu thuê mới',
      `Bạn nhận được yêu cầu thuê mới cho đồ chơi ${toy.title}.`,
    );

    return toRentalOrderDto(orderDoc);
  }

  public async accept(actor: RequestActor, orderId: string): Promise<RentalOrderDto> {
    const order = await this.loadForParty(actor, orderId, 'owner');
    this.assertStatus(order, 'PENDING');
    const now = this.clock.now();
    this.assertBeforeDeadline(order, 'OWNER_RESPONSE', now);

    const settings = await this.settings.getRentalSettings();
    const dueAt = paymentDue(now, order.period.startDate, settings);

    const updated = await this.transition({
      orderId,
      from: 'PENDING',
      to: 'ACCEPTED',
      changedBy: actor.userId,
      filter: this.beforeDeadline('OWNER_RESPONSE', now),
      set: {
        timer: {
          kind: 'PAYMENT',
          dueAt,
        },
      },
      note: 'Chủ đồ chơi chấp nhận yêu cầu thuê',
    });

    await this.notifyParty(
      updated,
      'renter',
      'Yêu cầu thuê đã được chấp nhận',
      'Chủ đồ chơi đã chấp nhận yêu cầu thuê của bạn. Vui lòng thanh toán trong thời hạn.',
    );

    return toRentalOrderDto(updated);
  }

  public async reject(
    actor: RequestActor,
    orderId: string,
    reason: string,
  ): Promise<RentalOrderDto> {
    await this.loadForParty(actor, orderId, 'owner');

    const updated = await this.transition({
      orderId,
      from: 'PENDING',
      to: 'REJECTED',
      changedBy: actor.userId,
      set: {
        rejectionReason: reason,
      },
      note: reason,
    });

    await this.notifyParty(
      updated,
      'renter',
      'Yêu cầu thuê bị từ chối',
      `Chủ đồ chơi đã từ chối yêu cầu thuê: ${reason}`,
    );

    return toRentalOrderDto(updated);
  }

  public async get(actor: RequestActor, orderId: string): Promise<RentalOrderDetailDto> {
    const order = await this.loadForParty(actor, orderId, 'any');
    const dto = toRentalOrderDto(order) as RentalOrderDetailDto;

    if (actor.userId === order.ownerId.toString()) {
      const renter = await this.userModel.findById(order.renterId);
      if (renter) {
        dto.renter = {
          fullName: renter.fullName,
          avatar: renter.avatar ?? undefined,
          trustScore: renter.trust?.score ?? undefined,
          verified: renter.verificationStatus === 'verified',
        };
      }
    }

    return dto;
  }

  public async list(
    actor: RequestActor,
    query: RentalListQuery,
  ): Promise<{ items: RentalOrderDto[]; total: number; page: number; limit: number }> {
    const { items, total } = await this.repository.listForParty(
      actor.userId,
      query.role,
      query.status,
      query.page,
      query.limit,
    );

    return {
      items: items.map((doc) => toRentalOrderDto(doc)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  public async pay(actor: RequestActor, orderId: string): Promise<RentalOrderDto> {
    await this.loadForParty(actor, orderId, 'renter');

    // Tạo ví trước khi mở transaction: lỗi trùng khoá khi upsert trong transaction sẽ huỷ cả transaction
    const [renterWallet, escrowWallet] = await Promise.all([
      this.ledger.getOrCreateUserWallet(actor.userId),
      this.ledger.getOrCreateSystemWallet('escrow'),
    ]);

    const now = this.clock.now();
    const updated = await this.transition({
      orderId,
      from: 'ACCEPTED',
      to: 'PAID',
      changedBy: actor.userId,
      filter: { 'timer.dueAt': { $gt: now } },
      inTransaction: async (order, session) => {
        const totalPayable = order.pricing.totalPayable;
        const postingKey = `rental:${order._id.toString()}:pay`;

        await this.ledger.post(
          postingKey,
          { kind: 'rental_order', id: order._id.toString() },
          [
            { walletId: renterWallet.id, amount: -totalPayable },
            { walletId: escrowWallet.id, amount: totalPayable },
          ],
          session,
          'Thanh toán tiền thuê và tiền cọc',
        );
      },
    });

    await this.notifyParty(
      updated,
      'owner',
      'Đơn thuê đã được thanh toán',
      'Người thuê đã thanh toán tiền cọc và tiền thuê vào tài khoản ký quỹ.',
    );

    return toRentalOrderDto(updated);
  }

  public async history(actor: RequestActor, orderId: string): Promise<RentalHistoryEntryDto[]> {
    const order = await this.loadForParty(actor, orderId, 'any');
    const rows = await this.orderStatusHistoryModel
      .find({ orderType: 'RENTAL', orderId: order._id })
      .sort({ occurredAt: 1 })
      .exec();

    return rows.map((r) => ({
      oldStatus: (r.oldStatus as RentalOrderStatus) ?? undefined,
      newStatus: r.newStatus as RentalOrderStatus,
      changedBy: r.changedBy.toString(),
      notes: r.notes ?? undefined,
      occurredAt: r.occurredAt,
    }));
  }

  private async uploadPhotos(files: Express.Multer.File[]): Promise<ToyImage[]> {
    if (!files || files.length === 0) {
      throw new AppError(400, 'INVALID_IMAGE_UPLOAD', 'Vui lòng cung cấp ít nhất 1 ảnh chụp.');
    }
    if (files.length > 10) {
      throw new AppError(400, 'INVALID_IMAGE_UPLOAD', 'Chỉ được tải lên tối đa 10 ảnh chụp.');
    }

    for (const file of files) {
      validateToyImage(file.buffer, file.mimetype);
    }

    const uploaded: ToyImage[] = [];
    try {
      for (const file of files) {
        const item = await this.photos.upload(file.buffer, file.mimetype);
        uploaded.push(item);
      }
      return uploaded;
    } catch (err) {
      if (uploaded.length > 0) {
        await this.photos.delete(uploaded.map((p) => p.publicId)).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Upload ảnh rồi chạy `work` (chỉ gồm transaction). Ảnh chỉ bị xoá khi `work` lỗi;
   * thông báo phải gửi sau khi hàm này trả về để lỗi sau commit không xoá ảnh đơn đang dùng.
   */
  private async withUploadedPhotos<T>(
    files: Express.Multer.File[],
    work: (photos: ToyImage[]) => Promise<T>,
  ): Promise<T> {
    const photos = await this.uploadPhotos(files);
    try {
      return await work(photos);
    } catch (err) {
      if (photos.length > 0) {
        await this.photos.delete(photos.map((p) => p.publicId)).catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Thao tác làm đổi kết cục (duyệt đơn, báo hư hỏng) phải xảy ra trước hạn của timer tương ứng,
   * kể cả khi scheduler chưa kịp chạy. Dùng làm `filter` cho transition và để chặn sớm.
   */
  private beforeDeadline(kind: RentalTimerKind, now: Date): Record<string, unknown> {
    return { 'timer.kind': kind, 'timer.dueAt': { $gt: now } };
  }

  private assertBeforeDeadline(order: RentalOrderDoc, kind: RentalTimerKind, now: Date): void {
    if (order.timer?.kind !== kind || order.timer.dueAt.getTime() <= now.getTime()) {
      throw new AppError(
        409,
        'INVALID_RENTAL_TRANSITION',
        'Đã quá thời hạn thực hiện thao tác này.',
      );
    }
  }

  /** Chặn sớm trước khi upload; transaction vẫn kiểm tra lại trạng thái. */
  private assertStatus(order: RentalOrderDoc, expected: RentalOrderStatus): void {
    if (order.status !== expected) {
      throw new AppError(
        409,
        'INVALID_RENTAL_TRANSITION',
        'Trạng thái đơn thuê không hợp lệ hoặc đã thay đổi.',
      );
    }
  }

  public async ship(
    actor: RequestActor,
    orderId: string,
    files: Express.Multer.File[],
  ): Promise<RentalOrderDto> {
    const existing = await this.loadForParty(actor, orderId, 'owner');
    this.assertStatus(existing, 'PAID');

    const updated = await this.withUploadedPhotos(files, async (photos) => {
      const now = this.clock.now();
      const s = await this.settings.getRentalSettings();

      return this.transition({
        orderId,
        from: 'PAID',
        to: 'SHIPPING',
        changedBy: actor.userId,
        set: {
          'handover.ownerPhotos': photos,
          'handover.shippedAt': now,
          timer: {
            kind: 'RECEIPT_CONFIRM',
            dueAt: receiptDue(now, s),
          },
        },
      });
    });

    await this.notifyParty(
      updated,
      'renter',
      'Đơn thuê đang được giao',
      `Chủ đồ chơi đã gửi hàng kèm ${updated.handover?.ownerPhotos.length ?? 0} ảnh bàn giao. Vui lòng kiểm tra và xác nhận khi nhận được đồ chơi.`,
    );

    return toRentalOrderDto(updated);
  }

  public async receive(
    actor: RequestActor,
    orderId: string,
    files: Express.Multer.File[],
  ): Promise<RentalOrderDto> {
    const existing = await this.loadForParty(actor, orderId, 'renter');
    this.assertStatus(existing, 'SHIPPING');

    const updated = await this.withUploadedPhotos(files, async (photos) => {
      const now = this.clock.now();
      const s = await this.settings.getRentalSettings();

      return this.transition({
        orderId,
        from: 'SHIPPING',
        to: 'IN_USE',
        changedBy: actor.userId,
        set: {
          'handover.renterPhotos': photos,
          'handover.receivedAt': now,
          'handover.autoConfirmed': false,
          rentalStartedAt: now,
          timer: {
            kind: 'RETURN_REMINDER',
            dueAt: returnReminderDue(existing.period.endDate, now, s),
          },
        },
      });
    });

    await this.notifyParty(
      updated,
      'owner',
      'Người thuê đã nhận được đồ chơi',
      'Người thuê đã nhận được đồ chơi và tải lên ảnh xác nhận. Thời gian thuê bắt đầu.',
    );

    return toRentalOrderDto(updated);
  }

  public async requestReturn(
    actor: RequestActor,
    orderId: string,
    files: Express.Multer.File[],
    note?: string | undefined,
  ): Promise<RentalOrderDto> {
    const existing = await this.loadForParty(actor, orderId, 'renter');
    this.assertStatus(existing, 'IN_USE');

    const updated = await this.withUploadedPhotos(files, async (photos) => {
      const now = this.clock.now();
      const s = await this.settings.getRentalSettings();
      const { lateDays, lateFee } = computeLateFee(
        {
          endDate: existing.period.endDate,
          dailyRate: existing.pricing.dailyRate,
          depositAmount: existing.pricing.depositAmount,
        },
        now,
        s,
      );

      return this.transition({
        orderId,
        from: 'IN_USE',
        to: 'RETURNING',
        changedBy: actor.userId,
        set: {
          returnInfo: {
            photos,
            note: note || undefined,
            requestedAt: now,
            lateDays,
            lateFee,
          },
          timer: {
            kind: 'SETTLEMENT',
            dueAt: settlementDue(now, s),
          },
        },
      });
    });

    const lateFee = updated.returnInfo?.lateFee ?? 0;
    const feeNotice =
      lateFee > 0
        ? ` Phí trả trễ phát sinh: ${lateFee.toLocaleString('vi-VN')} VND (${updated.returnInfo?.lateDays ?? 0} ngày).`
        : '';
    await this.notifyParty(
      updated,
      'owner',
      'Người thuê đã yêu cầu trả đồ chơi',
      `Người thuê đã gửi yêu cầu hoàn trả đồ chơi kèm ảnh xác nhận.${feeNotice}`,
    );

    return toRentalOrderDto(updated);
  }

  public async settle(
    actor: RequestActor,
    orderId: string,
    input: SettleRentalInput,
    files: Express.Multer.File[] = [],
  ): Promise<RentalOrderDto> {
    const existing = await this.loadForParty(actor, orderId, 'owner');
    this.assertStatus(existing, 'RETURNING');

    if (input.result === 'GOOD') {
      const wallets = await this.prepareSettleWallets(existing);
      const now = this.clock.now();
      const updated = await this.transition({
        orderId,
        from: 'RETURNING',
        to: 'COMPLETED',
        changedBy: actor.userId,
        inTransaction: async (order, session) => {
          await this.postSettleLedger(order, wallets, session);
        },
        set: {
          settlement: {
            result: 'GOOD',
            settledAt: now,
            autoSettled: false,
          },
        },
      });

      await this.notifyParty(
        updated,
        'renter',
        'Đơn thuê đã quyết toán thành công',
        'Chủ đồ chơi đã xác nhận đồ chơi trong tình trạng tốt. Tiền cọc đã được hoàn lại vào ví của bạn.',
      );
      await this.notifyParty(
        updated,
        'owner',
        'Đơn thuê đã quyết toán thành công',
        'Đơn thuê đã hoàn thành. Tiền thuê đồ chơi đã được chuyển vào ví của bạn.',
      );

      return toRentalOrderDto(updated);
    }

    if (input.result === 'DAMAGED') {
      if (!files || files.length === 0) {
        throw new AppError(
          400,
          'INVALID_IMAGE_UPLOAD',
          'Vui lòng tải lên từ 1 đến 10 ảnh bằng chứng hư hại.',
        );
      }

      const description = input.description;
      if (!description) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Mô tả hư hại phải có độ dài từ 10 đến 1000 ký tự.',
        );
      }

      // Quá 72h thì đơn được coi là "Tốt" (UC11), nên không còn báo hư hỏng được
      this.assertBeforeDeadline(existing, 'SETTLEMENT', this.clock.now());

      const updated = await this.withUploadedPhotos(files, async (photos) => {
        const now = this.clock.now();
        const disputeId = new Types.ObjectId();

        return this.transition({
          orderId,
          from: 'RETURNING',
          to: 'DISPUTING',
          changedBy: actor.userId,
          filter: this.beforeDeadline('SETTLEMENT', now),
          inTransaction: async (order, session) => {
            const disputeCode = 'DP' + this.repository.generateCode(now).slice(2);
            await this.disputeModel.create(
              [
                {
                  _id: disputeId,
                  code: disputeCode,
                  orderType: 'rental_order',
                  orderId: order._id,
                  claimantId: order.ownerId,
                  respondentId: order.renterId,
                  reason: 'DAMAGED_ON_RETURN',
                  description,
                  status: 'open',
                  openedAt: now,
                },
              ],
              { session },
            );
          },
          set: {
            settlement: {
              result: 'DAMAGED',
              evidencePhotos: photos,
              description,
              settledAt: now,
              disputeId,
            },
          },
        });
      });

      await this.notifyParty(
        updated,
        'renter',
        'Đơn thuê có khiếu nại đồ chơi bị hỏng',
        'Chủ đồ chơi đã báo cáo đồ chơi bị hư hỏng khi nhận lại. Một khiếu nại đã được mở để giải quyết.',
      );
      await this.notifyAdmins(
        'Khiếu nại hư hỏng đồ chơi mới',
        `Đơn thuê ${updated.code} có báo cáo hư hỏng đồ chơi từ chủ đồ chơi.`,
      );

      return toRentalOrderDto(updated);
    }

    throw new AppError(400, 'VALIDATION_ERROR', 'Kết quả quyết toán phải là GOOD hoặc DAMAGED.');
  }
}

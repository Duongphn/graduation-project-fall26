import { Types } from 'mongoose';
import { type RentalOrderStatus, SYSTEM_ACTOR_ID } from '../constants/rental-order-status.js';
import { type RentalOrderDoc } from '../models/rental-order.model.js';
import { nextOverdueReminder, rentalEnd, returnReminderDue } from './rental-time.js';
import { AppError } from '../utils/app-error.js';
import { RentalOrderCore } from './rental-order-core.js';

/**
 * Hành động do scheduler gọi khi timer tới hạn (actor là System). Mỗi hàm lọc lại theo
 * `timer.kind` và `timer.dueAt <= now` nên chạy lại nhiều lần vẫn an toàn.
 */
export class RentalSystemService extends RentalOrderCore {
  public async autoConfirmReceipt(orderId: string): Promise<void> {
    const order = await this.rentalOrderModel.findById(orderId);
    if (!order || order.status !== 'SHIPPING') {
      return;
    }
    const now = this.clock.now();
    if (
      order.timer?.kind !== 'RECEIPT_CONFIRM' ||
      !order.timer.dueAt ||
      order.timer.dueAt.getTime() > now.getTime()
    ) {
      return;
    }

    const s = await this.settings.getRentalSettings();
    const dueAt = returnReminderDue(order.period.endDate, now, s);

    try {
      const updated = await this.transition({
        orderId,
        from: 'SHIPPING',
        to: 'IN_USE',
        changedBy: SYSTEM_ACTOR_ID,
        note: 'system:RECEIPT_CONFIRM',
        filter: {
          'timer.kind': 'RECEIPT_CONFIRM',
          'timer.dueAt': { $lte: now },
        },
        set: {
          'handover.autoConfirmed': true,
          rentalStartedAt: now,
          timer: {
            kind: 'RETURN_REMINDER',
            dueAt,
          },
        },
      });

      await this.notifyParty(
        updated,
        'renter',
        'Đơn thuê đã tự động xác nhận nhận hàng',
        'Thời hạn 48 giờ đã hết, đơn thuê tự động chuyển sang trạng thái đang sử dụng.',
      );
      await this.notifyParty(
        updated,
        'owner',
        'Đơn thuê đã tự động xác nhận nhận hàng',
        'Thời hạn 48 giờ đã hết, đơn thuê tự động chuyển sang trạng thái đang sử dụng.',
      );
    } catch (err) {
      if (err instanceof AppError && err.code === 'INVALID_RENTAL_TRANSITION') {
        return;
      }
      throw err;
    }
  }

  public async autoSettle(orderId: string): Promise<void> {
    const order = await this.rentalOrderModel.findById(orderId);
    if (!order || order.status !== 'RETURNING') {
      return;
    }
    const now = this.clock.now();
    if (
      order.timer?.kind !== 'SETTLEMENT' ||
      !order.timer.dueAt ||
      order.timer.dueAt.getTime() > now.getTime()
    ) {
      return;
    }

    const wallets = await this.prepareSettleWallets(order);

    try {
      const updated = await this.transition({
        orderId,
        from: 'RETURNING',
        to: 'COMPLETED',
        changedBy: SYSTEM_ACTOR_ID,
        note: 'system:SETTLEMENT',
        filter: {
          'timer.kind': 'SETTLEMENT',
          'timer.dueAt': { $lte: now },
        },
        inTransaction: async (ord, session) => {
          await this.postSettleLedger(ord, wallets, session);
        },
        set: {
          settlement: {
            result: 'GOOD',
            settledAt: now,
            autoSettled: true,
          },
        },
      });

      await this.notifyParty(
        updated,
        'renter',
        'Đơn thuê đã quyết toán thành công',
        'Thời hạn kiểm tra đã hết, đơn thuê được tự động quyết toán thành công.',
      );
      await this.notifyParty(
        updated,
        'owner',
        'Đơn thuê đã quyết toán thành công',
        'Thời hạn kiểm tra đã hết, đơn thuê được tự động quyết toán thành công.',
      );
    } catch (err) {
      if (err instanceof AppError && err.code === 'INVALID_RENTAL_TRANSITION') {
        return;
      }
      throw err;
    }
  }

  public async expire(orderId: string, kind: 'OWNER_RESPONSE' | 'PAYMENT'): Promise<void> {
    const fromStatus: RentalOrderStatus = kind === 'OWNER_RESPONSE' ? 'PENDING' : 'ACCEPTED';
    const note = `system:${kind}`;
    const now = this.clock.now();

    try {
      const updated = await this.transition({
        orderId,
        from: fromStatus,
        to: 'EXPIRED',
        changedBy: SYSTEM_ACTOR_ID,
        note,
        filter: {
          'timer.kind': kind,
          'timer.dueAt': { $lte: now },
        },
      });

      if (kind === 'OWNER_RESPONSE') {
        await this.notifyParty(
          updated,
          'renter',
          'Yêu cầu thuê đã hết hạn',
          'Chủ đồ chơi đã không phản hồi yêu cầu thuê trong vòng 24 giờ. Yêu cầu đã hết hạn.',
        );
        await this.notifyParty(
          updated,
          'owner',
          'Yêu cầu thuê đã hết hạn',
          'Thời hạn 24 giờ phản hồi đã hết. Yêu cầu thuê đã hết hạn.',
        );
      } else {
        await this.notifyParty(
          updated,
          'renter',
          'Đơn thuê đã hết hạn thanh toán',
          'Thời hạn 12 giờ thanh toán đã hết. Đơn thuê đã bị hủy.',
        );
        await this.notifyParty(
          updated,
          'owner',
          'Đơn thuê đã hết hạn thanh toán',
          'Người thuê đã không thanh toán đơn thuê trong vòng 12 giờ. Đơn thuê đã bị hủy.',
        );
      }
    } catch (err) {
      if (err instanceof AppError && err.code === 'INVALID_RENTAL_TRANSITION') {
        return;
      }
      throw err;
    }
  }

  public async remindReturn(orderId: string): Promise<void> {
    const now = this.clock.now();
    const order = await this.rentalOrderModel.findOne({
      _id: new Types.ObjectId(orderId),
      status: 'IN_USE',
      'timer.kind': 'RETURN_REMINDER',
      'timer.dueAt': { $lte: now },
    });

    if (!order) {
      return;
    }

    // Đã quá hạn (vd. nhận đồ trễ): bỏ lời nhắc "sắp hết hạn", gửi ngay một lời nhắc quá hạn
    const end = rentalEnd(order.period.endDate);
    const alreadyOverdue = end.getTime() <= now.getTime();

    const updated = await this.rentalOrderModel.findOneAndUpdate(
      {
        _id: order._id,
        status: 'IN_USE',
        'timer.kind': 'RETURN_REMINDER',
        'timer.dueAt': { $lte: now },
      },
      {
        $set: {
          timer: {
            kind: 'OVERDUE',
            dueAt: alreadyOverdue ? nextOverdueReminder(end, now) : end,
          },
          ...(alreadyOverdue ? { lastReminderAt: now } : {}),
        },
      },
      { new: true },
    );

    if (!updated) {
      return;
    }

    if (alreadyOverdue) {
      await this.sendOverdueReminders(updated);
      return;
    }

    await this.notifyParty(
      updated,
      'renter',
      'Nhắc nhở sắp hết hạn thuê đồ chơi',
      'Đơn thuê của bạn sắp hết hạn. Vui lòng chuẩn bị hoàn trả đồ chơi đúng hạn.',
    );
  }

  private async sendOverdueReminders(order: RentalOrderDoc): Promise<void> {
    await this.notifyParty(
      order,
      'renter',
      'Đơn thuê quá hạn',
      'Đơn thuê đồ chơi của bạn đã quá hạn. Phí trả trễ sẽ được tính theo ngày cho đến khi bạn gửi yêu cầu hoàn trả.',
    );
    await this.notifyParty(
      order,
      'owner',
      'Đơn thuê quá hạn',
      'Đơn thuê đồ chơi đã quá thời hạn trả. Hệ thống sẽ tiếp tục theo dõi và tính phí trả trễ.',
    );
  }

  public async remindOverdue(orderId: string): Promise<void> {
    const now = this.clock.now();
    const order = await this.rentalOrderModel.findOne({
      _id: new Types.ObjectId(orderId),
      status: 'IN_USE',
      'timer.kind': 'OVERDUE',
      'timer.dueAt': { $lte: now },
    });

    if (!order || !order.timer?.dueAt) {
      return;
    }

    const nextDue = nextOverdueReminder(order.timer.dueAt, now);
    const updated = await this.rentalOrderModel.findOneAndUpdate(
      {
        _id: order._id,
        status: 'IN_USE',
        'timer.kind': 'OVERDUE',
        'timer.dueAt': { $lte: now },
      },
      {
        $set: {
          lastReminderAt: now,
          'timer.dueAt': nextDue,
        },
      },
      { new: true },
    );

    if (!updated) {
      return;
    }

    await this.sendOverdueReminders(updated);
  }
}

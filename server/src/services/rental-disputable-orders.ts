import mongoose from 'mongoose';
import {
  type DisputableOrders,
  type MarkDisputedParams,
  type OpenContext,
  type OrderCaseFile,
  type SettleDisputeParams,
} from '../interfaces/dispute.ports.js';
import { type RentalOrderDoc } from '../models/rental-order.model.js';
import { type RentalOrderDto } from '../types/rental-order.types.js';
import { AppError } from '../utils/app-error.js';
import { RentalOrderCore } from './rental-order-core.js';
import { toRentalHistoryEntryDto, toRentalOrderDto } from './rental-order.mapper.js';
import {
  type ClaimantRole,
  type DisputeAmounts,
  disputeCompensationCap,
  disputePayout,
  disputeSettlementEntries,
  type Payout,
} from './rental-pricing.js';

const HOUR_MS = 3_600_000;

function windowClosed(): AppError {
  return new AppError(
    400,
    'COMPLAINT_WINDOW_CLOSED',
    'Đã hết thời hạn gửi khiếu nại cho đơn thuê này.',
  );
}

function wrongStatus(): AppError {
  return new AppError(
    409,
    'INVALID_RENTAL_TRANSITION',
    'Trạng thái đơn thuê không hợp lệ hoặc đã thay đổi.',
  );
}

/**
 * Rental side of a dispute: who may complain and until when, and moving the order to DISPUTING.
 * Renter: IN_USE, within `renterComplaintHours` of `rentalStartedAt`. Owner: RETURNING, before the SETTLEMENT timer.
 */
export class RentalDisputableOrders extends RentalOrderCore implements DisputableOrders {
  public readonly orderType = 'rental_order' as const;

  public async assertCanOpen(actorId: string, orderId: string, now: Date): Promise<OpenContext> {
    const order = mongoose.Types.ObjectId.isValid(orderId)
      ? await this.rentalOrderModel.findById(orderId)
      : null;
    const renterId = order?.renterId.toString();
    const ownerId = order?.ownerId.toString();
    if (!order || (actorId !== renterId && actorId !== ownerId)) {
      throw new AppError(404, 'RENTAL_NOT_FOUND', 'Không tìm thấy đơn thuê.');
    }

    const claimantRole: ClaimantRole = actorId === renterId ? 'renter' : 'owner';

    if (claimantRole === 'renter') {
      if (order.status !== 'IN_USE') {
        throw wrongStatus();
      }
      const { renterComplaintHours } = await this.settings.getRentalSettings();
      const startedAt = order.rentalStartedAt;
      if (!startedAt || now.getTime() >= startedAt.getTime() + renterComplaintHours * HOUR_MS) {
        throw windowClosed();
      }
    } else {
      if (order.status !== 'RETURNING') {
        throw wrongStatus();
      }
      if (order.timer?.kind !== 'SETTLEMENT' || order.timer.dueAt.getTime() <= now.getTime()) {
        throw windowClosed();
      }
    }

    return {
      claimantRole,
      claimantId: actorId,
      respondentId: (claimantRole === 'renter' ? ownerId : renterId) as string,
      orderCode: order.code,
    };
  }

  public async markDisputed(p: MarkDisputedParams): Promise<RentalOrderDto> {
    let from: 'IN_USE' | 'RETURNING';
    let filter: Record<string, unknown>;
    const set: Record<string, unknown> = { disputeId: p.disputeId };

    if (p.claimantRole === 'renter') {
      const { renterComplaintHours } = await this.settings.getRentalSettings();
      from = 'IN_USE';
      filter = {
        rentalStartedAt: { $gt: new Date(p.now.getTime() - renterComplaintHours * HOUR_MS) },
      };
    } else {
      from = 'RETURNING';
      filter = this.beforeDeadline('SETTLEMENT', p.now);
      set.settlement = {
        result: 'DAMAGED',
        evidencePhotos: p.evidence.photos,
        description: p.evidence.description,
        settledAt: p.now,
        disputeId: p.disputeId,
      };
    }

    const updated = await this.transition({
      orderId: p.orderId,
      from,
      to: 'DISPUTING',
      changedBy: p.actorId,
      filter,
      set,
      note: p.claimantRole === 'renter' ? 'Người thuê gửi khiếu nại' : 'Chủ đồ chơi gửi khiếu nại',
      inTransaction: async (_order, session) => {
        await p.inTransaction(session);
      },
    });

    return toRentalOrderDto(updated);
  }

  public async compensationCap(orderId: string, claimantRole: ClaimantRole): Promise<number> {
    return disputeCompensationCap(amountsOf(await this.findOrder(orderId)), claimantRole);
  }

  public async settleDispute(p: SettleDisputeParams): Promise<Payout> {
    const order = await this.findOrder(p.orderId);
    const amounts = amountsOf(order);
    const payout = disputePayout(amounts, p.claimantRole, p.compensation);
    // Wallets are created outside the transaction (see `pay`)
    const wallets = await this.prepareSettleWallets(order);

    await this.transition({
      orderId: p.orderId,
      from: 'DISPUTING',
      to: 'COMPLETED',
      changedBy: p.adminId,
      note: p.note,
      inTransaction: async (updated, session) => {
        await this.ledger.post(
          `rental:${updated._id.toString()}:dispute`,
          { kind: 'rental_order', id: updated._id.toString() },
          disputeSettlementEntries(payout, amounts.rentalFee + amounts.depositAmount, wallets),
          session,
          'Quyết toán theo phán quyết khiếu nại',
        );
        await p.inTransaction(session, payout);
      },
    });

    return payout;
  }

  public async caseFile(orderId: string): Promise<OrderCaseFile> {
    const order = await this.findOrder(orderId);
    const rows = await this.orderStatusHistoryModel
      .find({ orderType: 'RENTAL', orderId: order._id })
      .sort({ occurredAt: 1 })
      .exec();
    return {
      order: toRentalOrderDto(order),
      history: rows.map(toRentalHistoryEntryDto),
      amounts: amountsOf(order),
    };
  }

  public async orderCode(orderId: string): Promise<string> {
    return (await this.findOrder(orderId)).code;
  }

  private async findOrder(orderId: string): Promise<RentalOrderDoc> {
    const order = mongoose.Types.ObjectId.isValid(orderId)
      ? await this.rentalOrderModel.findById(orderId)
      : null;
    if (!order) {
      throw new AppError(404, 'RENTAL_NOT_FOUND', 'Không tìm thấy đơn thuê.');
    }
    return order;
  }
}

/** R, D, F and L of the order (`L = returnInfo.lateFee`, 0 when the toy was not returned). */
function amountsOf(order: RentalOrderDoc): DisputeAmounts {
  return {
    rentalFee: order.pricing.rentalFee,
    depositAmount: order.pricing.depositAmount,
    platformFee: order.pricing.platformFee,
    lateFee: order.returnInfo?.lateFee ?? 0,
  };
}

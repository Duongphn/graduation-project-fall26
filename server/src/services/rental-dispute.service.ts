import mongoose, { type FilterQuery, Types } from 'mongoose';
import {
  type DisputeRuling,
  OPEN_DISPUTE_STATUSES,
  rulingUpholdsClaim,
} from '../constants/dispute-ruling.js';
import { type RentalOrderStatus } from '../constants/rental-order-status.js';
import { type ToyImage } from '../interfaces/toy-listing.ports.js';
import { type IDispute } from '../models/dispute.model.js';
import { type IRentalOrder } from '../models/rental-order.model.js';
import {
  type DisputeDetailDto,
  type DisputeListItemDto,
  type DisputePartyDto,
  type DisputeResolutionDto,
} from '../types/rental-dispute.types.js';
import { type RentalSettings } from '../types/rental-order.types.js';
import { AppError } from '../utils/app-error.js';
import {
  type DisputeListQuery,
  type ResolveDisputeBody,
} from '../validations/rental-dispute.validation.js';
import { RentalOrderCore } from './rental-order-core.js';
import { toRentalOrderDto } from './rental-order.mapper.js';
import { type RulingSplit, rulingEntries, rulingSplit } from './rental-pricing.js';

const HOUR_MS = 3_600_000;

const rulingLabels: Record<DisputeRuling, string> = {
  RENTER_AT_FAULT: 'Người thuê có lỗi',
  OWNER_AT_FAULT: 'Chủ đồ có lỗi',
  UNDETERMINED: 'Không xác định được lỗi',
  FAIR_WEAR_AND_TEAR: 'Hao mòn tự nhiên',
};

const vnd = (amount: number) => `${amount.toLocaleString('vi-VN')} VND`;

const notFound = () => new AppError(404, 'DISPUTE_NOT_FOUND', 'Không tìm thấy khiếu nại.');

/**
 * Ảnh bằng chứng của bên khiếu nại: người thuê gửi kèm khiếu nại (lưu trên Dispute), chủ đồ gửi khi
 * quyết toán Hư hỏng (lưu ở settlement của đơn).
 */
export const disputeEvidencePhotos = (
  dispute: Pick<IDispute, 'evidencePhotos'>,
  order: Pick<IRentalOrder, 'settlement'>,
): ToyImage[] => dispute.evidencePhotos ?? order.settlement?.evidencePhotos ?? [];

/**
 * Admin giải quyết khiếu nại đơn thuê (UC19): danh sách, hồ sơ bằng chứng hai bên và phán quyết.
 * Phán quyết trả toàn bộ R + D đang giữ ở escrow trong một bút toán rồi chuyển đơn sang Hoàn tất.
 */
export class RentalDisputeService extends RentalOrderCore {
  /** Hạn phản hồi của bên bị khiếu nại; khiếu nại cũ chưa có timer thì tính từ lúc mở. */
  private replyDueAt(dispute: IDispute, settings: RentalSettings): Date {
    return (
      dispute.timer?.dueAt ??
      new Date(dispute.openedAt.getTime() + settings.disputeReplyHours * HOUR_MS)
    );
  }

  private claimantOf(dispute: IDispute, order: IRentalOrder): 'owner' | 'renter' {
    return dispute.claimantId.equals(order.ownerId) ? 'owner' : 'renter';
  }

  private async parties(
    ids: Types.ObjectId[],
  ): Promise<Map<string, DisputePartyDto>> {
    const users = await this.userModel
      .find({ _id: { $in: ids } })
      .select('fullName avatar trust')
      .lean();
    return new Map(
      users.map((u) => [
        u._id.toString(),
        {
          id: u._id.toString(),
          fullName: u.fullName,
          avatar: u.avatar ?? undefined,
          trustScore: u.trust?.score ?? undefined,
        },
      ]),
    );
  }

  private async toys(ids: Types.ObjectId[]) {
    const toys = await this.toyModel
      .find({ _id: { $in: ids } })
      .select('title images')
      .lean();
    return new Map(
      toys.map((t) => [
        t._id.toString(),
        {
          id: t._id.toString(),
          title: t.title,
          image: t.images?.[0] ? { url: t.images[0].url, publicId: t.images[0].publicId } : undefined,
        },
      ]),
    );
  }

  private toListItem(
    dispute: IDispute,
    order: IRentalOrder,
    settings: RentalSettings,
    users: Map<string, DisputePartyDto>,
    toys: Map<string, DisputeListItemDto['toy']>,
  ): DisputeListItemDto {
    return {
      id: dispute._id.toString(),
      code: dispute.code,
      status: dispute.status,
      reason: dispute.reason,
      openedAt: dispute.openedAt,
      replyDueAt: this.replyDueAt(dispute, settings),
      resolvedAt: dispute.resolvedAt ?? undefined,
      claimant: this.claimantOf(dispute, order),
      frozenAmount: order.pricing.rentalFee + order.pricing.depositAmount,
      order: { id: order._id.toString(), code: order.code, status: order.status },
      toy: toys.get(order.toyId.toString()) ?? null,
      owner: users.get(order.ownerId.toString()) ?? null,
      renter: users.get(order.renterId.toString()) ?? null,
    };
  }

  public async list(
    query: DisputeListQuery,
  ): Promise<{ items: DisputeListItemDto[]; total: number }> {
    const filter: FilterQuery<IDispute> = {
      orderType: 'rental_order',
      status: query.status === 'open' ? { $in: [...OPEN_DISPUTE_STATUSES] } : 'resolved',
    };
    // Chờ quyết định: cũ nhất trước (mục tiêu xử lý 7 ngày); đã xong: mới nhất trước
    const sort: Record<string, 1 | -1> =
      query.status === 'open' ? { openedAt: 1, _id: 1 } : { resolvedAt: -1, _id: -1 };

    const [disputes, total, settings] = await Promise.all([
      this.disputeModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      this.disputeModel.countDocuments(filter),
      this.settings.getRentalSettings(),
    ]);

    const orders = await this.rentalOrderModel
      .find({ _id: { $in: disputes.map((d) => d.orderId) } })
      .lean();
    const orderById = new Map(orders.map((o) => [o._id.toString(), o]));
    const [users, toys] = await Promise.all([
      this.parties(orders.flatMap((o) => [o.ownerId, o.renterId])),
      this.toys(orders.map((o) => o.toyId)),
    ]);

    const items = disputes.flatMap((d) => {
      const order = orderById.get(d.orderId.toString());
      return order ? [this.toListItem(d, order, settings, users, toys)] : [];
    });
    return { items, total };
  }

  private async loadCase(disputeId: string): Promise<{ dispute: IDispute; order: IRentalOrder }> {
    if (!mongoose.Types.ObjectId.isValid(disputeId)) {
      throw notFound();
    }
    const dispute = await this.disputeModel.findById(disputeId).lean();
    if (!dispute || dispute.orderType !== 'rental_order') {
      throw notFound();
    }
    const order = await this.rentalOrderModel.findById(dispute.orderId).lean();
    if (!order) {
      throw notFound();
    }
    return { dispute, order };
  }

  public async detail(disputeId: string): Promise<DisputeDetailDto> {
    const { dispute, order } = await this.loadCase(disputeId);
    const [settings, users, toys, history] = await Promise.all([
      this.settings.getRentalSettings(),
      this.parties([order.ownerId, order.renterId]),
      this.toys([order.toyId]),
      this.orderStatusHistoryModel
        .find({ orderType: 'RENTAL', orderId: order._id })
        .sort({ occurredAt: 1 })
        .lean(),
    ]);

    const resolution: DisputeResolutionDto | undefined = dispute.resolution
      ? {
          ...dispute.resolution,
          resolvedBy: dispute.resolvedBy?.toString(),
          resolvedAt: dispute.resolvedAt ?? undefined,
        }
      : undefined;

    return {
      ...this.toListItem(dispute, order, settings, users, toys),
      description: dispute.description,
      evidencePhotos: disputeEvidencePhotos(dispute, order),
      response: dispute.response ?? undefined,
      rentalOrder: toRentalOrderDto(order),
      history: history.map((h) => ({
        oldStatus: (h.oldStatus as RentalOrderStatus) ?? undefined,
        newStatus: h.newStatus as RentalOrderStatus,
        changedBy: h.changedBy.toString(),
        notes: h.notes ?? undefined,
        occurredAt: h.occurredAt,
      })),
      resolution,
    };
  }

  /**
   * K (bồi thường cho chủ đồ) hoặc G (hoàn tiền thuê cho người thuê) theo tỷ lệ Admin chọn.
   * Chủ đồ khiếu nại thì G = 0 và K = tỷ lệ × cọc, nhưng không quá phần cọc còn lại sau phí trễ
   * (L + K ≤ D). Người thuê khiếu nại thì K = 0 và G = tỷ lệ × tiền thuê (I.2.6.6).
   */
  private computeSplit(
    order: IRentalOrder,
    claimant: 'owner' | 'renter',
    input: ResolveDisputeBody,
  ): { split: RulingSplit; compensation: number; rentRefund: number } {
    if (input.compensationRate > 0 && !rulingUpholdsClaim(input.ruling, claimant)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        claimant === 'owner'
          ? 'Chỉ bồi thường cho chủ đồ khi phán quyết là người thuê có lỗi.'
          : 'Chỉ hoàn tiền thuê khi phán quyết là chủ đồ có lỗi.',
      );
    }
    const { rentalFee, depositAmount, platformFeeRate } = order.pricing;
    const lateFee = order.returnInfo?.lateFee ?? 0;
    const rate = input.compensationRate / 100;
    const compensation =
      claimant === 'owner'
        ? Math.min(Math.round(rate * depositAmount), depositAmount - lateFee)
        : 0;
    const rentRefund = claimant === 'renter' ? Math.round(rate * rentalFee) : 0;
    const split = rulingSplit({
      rentalFee,
      depositAmount,
      platformFeeRate,
      lateFee,
      compensation,
      rentRefund,
    });
    return { split, compensation, rentRefund };
  }

  public async resolve(
    adminId: string,
    disputeId: string,
    input: ResolveDisputeBody,
  ): Promise<DisputeDetailDto> {
    const { dispute, order } = await this.loadCase(disputeId);
    if (!(OPEN_DISPUTE_STATUSES as readonly string[]).includes(dispute.status)) {
      throw new AppError(409, 'DISPUTE_ALREADY_RESOLVED', 'Khiếu nại này đã có phán quyết.');
    }
    if (order.status !== 'DISPUTING') {
      throw new AppError(
        409,
        'INVALID_RENTAL_TRANSITION',
        'Trạng thái đơn thuê không hợp lệ hoặc đã thay đổi.',
      );
    }

    const now = this.clock.now();
    const settings = await this.settings.getRentalSettings();
    const replyDueAt = this.replyDueAt(dispute, settings);
    // UC19: chỉ quyết định khi bên kia đã phản hồi (UC18) hoặc đã hết 72 giờ phản hồi
    if (!dispute.response && now.getTime() < replyDueAt.getTime()) {
      throw new AppError(
        409,
        'DISPUTE_REPLY_PENDING',
        'Bên bị khiếu nại vẫn còn thời hạn phản hồi. Vui lòng quyết định sau khi hết hạn.',
        { replyDueAt },
      );
    }

    const claimant = this.claimantOf(dispute, order);
    const { split, compensation, rentRefund } = this.computeSplit(order, claimant, input);
    const wallets = await this.prepareSettleWallets(order);
    const resolution = {
      ruling: input.ruling,
      compensationRate: input.compensationRate,
      compensationAmount: compensation,
      rentRefundAmount: rentRefund,
      ownerAmount: split.owner,
      renterAmount: split.renter,
      platformFee: split.platform,
      adminDecision: input.adminDecision,
    };

    const updated = await this.transition({
      orderId: order._id.toString(),
      from: 'DISPUTING',
      to: 'COMPLETED',
      changedBy: adminId,
      note: `Quản trị viên giải quyết khiếu nại: ${input.adminDecision}`,
      set: {
        'settlement.resolution': {
          ruling: input.ruling,
          compensationAmount: compensation,
          rentRefundAmount: rentRefund,
          ownerAmount: split.owner,
          renterAmount: split.renter,
          platformFee: split.platform,
          adminDecision: input.adminDecision,
          resolvedAt: now,
        },
      },
      inTransaction: async (o, session) => {
        // Phán quyết ghi một lần (GB-26): hai Admin bấm cùng lúc thì người sau nhận 409
        const res = await this.disputeModel.updateOne(
          { _id: dispute._id, status: { $in: [...OPEN_DISPUTE_STATUSES] } },
          {
            $set: {
              status: 'resolved',
              resolution,
              resolvedBy: new Types.ObjectId(adminId),
              resolvedAt: now,
            },
          },
          { session },
        );
        if (res.modifiedCount === 0) {
          throw new AppError(409, 'DISPUTE_ALREADY_RESOLVED', 'Khiếu nại này đã có phán quyết.');
        }
        await this.ledger.post(
          `rental:${o._id.toString()}:ruling`,
          { kind: 'rental_order', id: o._id.toString() },
          rulingEntries(split, wallets),
          session,
          'Quyết toán theo phán quyết khiếu nại',
        );
      },
    });

    const title = 'Khiếu nại đơn thuê đã được giải quyết';
    const intro = `Quản trị viên đã giải quyết khiếu nại đơn ${updated.code}.`;
    const verdict = `Phán quyết: ${rulingLabels[input.ruling]}. Lý do: ${input.adminDecision}`;
    const ownerExtra = compensation > 0 ? ` (gồm ${vnd(compensation)} bồi thường)` : '';
    const renterExtra =
      compensation > 0 ? ` (đã trừ ${vnd(compensation)} bồi thường cho chủ đồ)` : '';
    await this.notifyParty(
      updated,
      'owner',
      title,
      `${intro} ${vnd(split.owner)} đã được chuyển vào ví của bạn${ownerExtra}. ${verdict}`,
      'DISPUTE',
    );
    await this.notifyParty(
      updated,
      'renter',
      title,
      `${intro} ${vnd(split.renter)} đã được hoàn vào ví của bạn${renterExtra}. ${verdict}`,
      'DISPUTE',
    );

    return this.detail(disputeId);
  }
}

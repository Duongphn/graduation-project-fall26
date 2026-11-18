import { type IRentalOrder, type RentalOrderDoc } from '../models/rental-order.model.js';
import { type EnrichedRentalOrderDoc } from '../repositories/rental-order.repository.js';
import {
  type RentalFinancialBreakdownDto,
  type RentalOrderDetailDto,
  type RentalOrderDto,
  type RentalOrderItemDto,
  type RentalOrderItemPricingDto,
  type RentalPartyProfileDto,
  type RentalTimelineEntryDto,
  type RentalToySummaryDto,
} from '../types/rental-order.types.js';
import { formatDateOnly } from './rental-time.js';

/** Chuyển document đơn thuê sang DTO trả về API; nhóm con rỗng (chưa giao, chưa trả…) bị bỏ. */
export function toRentalOrderDto(doc: RentalOrderDoc | IRentalOrder): RentalOrderDto {
  return {
    id: doc._id.toString(),
    code: doc.code,
    toyId: doc.toyId.toString(),
    renterId: doc.renterId.toString(),
    ownerId: doc.ownerId.toString(),
    period: {
      startDate: formatDateOnly(doc.period.startDate),
      endDate: formatDateOnly(doc.period.endDate),
    },
    pricing: doc.pricing,
    status: doc.status,
    timer: doc.timer?.kind && doc.timer.dueAt ? { kind: doc.timer.kind, dueAt: doc.timer.dueAt } : undefined,
    rejectionReason: doc.rejectionReason ?? undefined,
    handover:
      doc.handover &&
      (doc.handover.shippedAt ||
        doc.handover.receivedAt ||
        doc.handover.autoConfirmed ||
        (doc.handover.ownerPhotos && doc.handover.ownerPhotos.length > 0))
        ? {
            ownerPhotos: doc.handover.ownerPhotos ?? [],
            shippedAt: doc.handover.shippedAt ?? undefined,
            renterPhotos: doc.handover.renterPhotos ?? [],
            receivedAt: doc.handover.receivedAt ?? undefined,
            autoConfirmed: doc.handover.autoConfirmed ?? undefined,
          }
        : undefined,
    rentalStartedAt: doc.rentalStartedAt ?? undefined,
    returnInfo:
      doc.returnInfo && doc.returnInfo.requestedAt
        ? {
            photos: doc.returnInfo.photos ?? [],
            note: doc.returnInfo.note ?? undefined,
            requestedAt: doc.returnInfo.requestedAt,
            lateDays: doc.returnInfo.lateDays ?? 0,
            lateFee: doc.returnInfo.lateFee ?? 0,
          }
        : undefined,
    settlement:
      doc.settlement && doc.settlement.settledAt
        ? {
            result: doc.settlement.result,
            evidencePhotos: doc.settlement.evidencePhotos ?? undefined,
            description: doc.settlement.description ?? undefined,
            settledAt: doc.settlement.settledAt,
            autoSettled: doc.settlement.autoSettled ?? undefined,
            disputeId: doc.settlement.disputeId?.toString() ?? undefined,
          }
        : undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Chuyển document đơn thuê sang Item DTO cho danh sách đơn thuê (bỏ platformFee nếu là renter). */
export function toRentalOrderItemDto(
  doc: EnrichedRentalOrderDoc | IRentalOrder | RentalOrderDoc,
  actorRole?: string,
): RentalOrderItemDto {
  const enriched = doc as Partial<EnrichedRentalOrderDoc>;
  const isOwner =
    actorRole === 'owner' ||
    (actorRole !== 'renter' && enriched.role === 'owner');
  const role: 'renter' | 'owner' = isOwner ? 'owner' : 'renter';

  // Renter does not receive platformFee or platformFeeRate in item pricing
  const isRenter =
    actorRole === 'renter' ||
    (!actorRole && enriched.role === 'renter') ||
    (!actorRole && !enriched.role);

  const pricing: RentalOrderItemPricingDto = {
    days: doc.pricing.days,
    dailyRate: doc.pricing.dailyRate,
    rentalFee: doc.pricing.rentalFee,
    depositAmount: doc.pricing.depositAmount,
    totalPayable: doc.pricing.totalPayable,
  };

  if (!isRenter) {
    pricing.platformFeeRate = doc.pricing.platformFeeRate;
    pricing.platformFee = doc.pricing.platformFee;
  }

  return {
    id: doc._id.toString(),
    code: doc.code,
    role,
    status: doc.status,
    period: {
      startDate: formatDateOnly(doc.period.startDate),
      endDate: formatDateOnly(doc.period.endDate),
    },
    pricing,
    toy: enriched.toy ?? undefined,
    counterpart: enriched.counterpart ?? undefined,
    timer:
      doc.timer?.kind && doc.timer.dueAt
        ? { kind: doc.timer.kind, dueAt: doc.timer.dueAt }
        : undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Chuyển document đơn thuê sang Detail DTO hoàn chỉnh kèm metadata mở rộng. */
export function toRentalOrderDetailDto(
  order: RentalOrderDoc | IRentalOrder,
  extras: {
    toy?: RentalToySummaryDto | undefined;
    renter?: RentalPartyProfileDto | undefined;
    owner?: RentalPartyProfileDto | undefined;
    timeline?: RentalTimelineEntryDto[] | undefined;
    financialBreakdown?: RentalFinancialBreakdownDto | undefined;
  } = {},
): RentalOrderDetailDto {
  const baseDto = toRentalOrderDto(order);
  return {
    ...baseDto,
    ...(extras.toy !== undefined ? { toy: extras.toy } : {}),
    ...(extras.renter !== undefined ? { renter: extras.renter } : {}),
    ...(extras.owner !== undefined ? { owner: extras.owner } : {}),
    ...(extras.timeline !== undefined ? { timeline: extras.timeline } : {}),
    ...(extras.financialBreakdown !== undefined
      ? { financialBreakdown: extras.financialBreakdown }
      : {}),
  };
}

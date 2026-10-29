import { type IRentalOrder, type RentalOrderDoc } from '../models/rental-order.model.js';
import { type RentalOrderDto } from '../types/rental-order.types.js';
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

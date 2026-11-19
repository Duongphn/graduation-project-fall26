import { type DisputeRuling } from '../constants/dispute-ruling.js';
import { type ToyImage } from '../interfaces/toy-listing.ports.js';
import { type RentalHistoryEntryDto, type RentalOrderDto } from './rental-order.types.js';

export type DisputeTab = 'open' | 'resolved';

export interface DisputePartyDto {
  id: string;
  fullName: string;
  avatar?: string | undefined;
  trustScore?: number | undefined;
}

export interface DisputeResolutionDto {
  ruling: DisputeRuling;
  compensationRate: number;
  compensationAmount: number;
  rentRefundAmount: number;
  ownerAmount: number;
  renterAmount: number;
  platformFee: number;
  adminDecision: string;
  resolvedBy?: string | undefined;
  resolvedAt?: Date | undefined;
}

/** Một dòng trong danh sách khiếu nại của Admin. */
export interface DisputeListItemDto {
  id: string;
  code: string;
  status: string;
  reason: string;
  openedAt: Date;
  /** Hạn bên bị khiếu nại phản hồi; sau hạn này Admin mới quyết định (UC19) */
  replyDueAt: Date;
  resolvedAt?: Date | undefined;
  /** Bên mở khiếu nại */
  claimant: 'owner' | 'renter';
  /** R + D đang bị giữ */
  frozenAmount: number;
  order: { id: string; code: string; status: string };
  toy: { id: string; title: string; image?: ToyImage | undefined } | null;
  owner: DisputePartyDto | null;
  renter: DisputePartyDto | null;
}

/** Hồ sơ khiếu nại: bằng chứng hai bên, lịch sử đơn và phán quyết (nếu đã có). */
export interface DisputeDetailDto extends DisputeListItemDto {
  description: string;
  rentalOrder: RentalOrderDto;
  history: RentalHistoryEntryDto[];
  resolution?: DisputeResolutionDto | undefined;
}

import {
  rentalOrderStatuses,
  type RentalOrderStatus,
  type RentalTimerKind,
} from '../constants/rental-order-status.js';
import { type DisputeRuling } from '../constants/dispute-ruling.js';
import { type ToyImage } from '../interfaces/toy-listing.ports.js';
import { type RentalCancelActor } from './order-cancel.types.js';

export interface RentalSettings {
  ownerResponseHours: number;
  paymentHours: number;
  receiptAutoConfirmHours: number;
  settlementHours: number;
  returnReminderHours: number;
  platformFeeRate: number;
  cancelFeeRate: number;
  lateFeeMultiplier: number;
  /** GB-29: điểm tin cậy tối thiểu để thuê đồ có tiền cọc cao */
  minTrustScore: number;
  /** GB-29: tiền cọc (VND) trên mức này mới áp dụng ngưỡng điểm tin cậy */
  trustDepositLimit: number;
  maxDays: number;
  bookingWindowDays: number;
  /** Hạn bên bị khiếu nại phản hồi trước khi Admin quyết định (GB-24) */
  disputeReplyHours: number;
  /** Người thuê báo đồ có vấn đề trong số giờ này kể từ lúc nhận đồ (UC17) */
  renterComplaintHours: number;
  /** Số ngày sau khi quyết toán mà hai bên còn được đánh giá nhau */
  reviewWindowDays: number;
}

export const DEFAULT_RENTAL_SETTINGS: RentalSettings = {
  ownerResponseHours: 24,
  paymentHours: 12,
  receiptAutoConfirmHours: 48,
  settlementHours: 48, // GB-22: the Owner inspects within 48 hours
  returnReminderHours: 24,
  platformFeeRate: 0.1,
  cancelFeeRate: 0.2,
  lateFeeMultiplier: 1.0,
  minTrustScore: 50,
  trustDepositLimit: 500_000,
  maxDays: 30,
  bookingWindowDays: 180,
  disputeReplyHours: 72,
  renterComplaintHours: 24,
  reviewWindowDays: 14,
};

/**
 * Time limits and the late fee multiplier copied from System Settings onto a rental order when it
 * is created (R03 I.2.6.2, GB-38): later steps of the order use this copy, not the latest value.
 */
export const RENTAL_POLICY_FIELDS = [
  'ownerResponseHours',
  'paymentHours',
  'receiptAutoConfirmHours',
  'settlementHours',
  'returnReminderHours',
  'disputeReplyHours',
  'renterComplaintHours',
  'lateFeeMultiplier',
] as const satisfies readonly (keyof RentalSettings)[];

export type RentalOrderPolicy = Pick<RentalSettings, (typeof RENTAL_POLICY_FIELDS)[number]>;

/** Phán quyết khiếu nại lưu trên đơn thuê (UC19). */
export interface RentalRulingSummary {
  ruling: DisputeRuling;
  compensationAmount: number;
  rentRefundAmount: number;
  ownerAmount: number;
  renterAmount: number;
  platformFee: number;
  adminDecision: string;
  resolvedAt: Date;
}

export interface RentalPeriod {
  startDate: Date;
  endDate: Date;
}

export interface RentalPricing {
  days: number;
  dailyRate: number;
  rentalFee: number;
  depositAmount: number;
  platformFeeRate: number;
  platformFee: number;
  totalPayable: number;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface RentalOrderDto {
  id: string;
  code: string;
  toyId: string;
  renterId: string;
  ownerId: string;
  period: DateRange;
  pricing: RentalPricing;
  status: RentalOrderStatus;
  timer?: { kind: RentalTimerKind; dueAt: Date } | undefined;
  rejectionReason?: string | undefined;
  cancellation?: {
    by: RentalCancelActor;
    userId: string;
    reason: string;
    fee: number;
    cancelledAt: Date;
  } | undefined;
  handover?: {
    ownerPhotos: ToyImage[];
    shippedAt?: Date | undefined;
    renterPhotos: ToyImage[];
    receivedAt?: Date | undefined;
    autoConfirmed?: boolean | undefined;
  } | undefined;
  rentalStartedAt?: Date | undefined;
  returnInfo?: {
    photos: ToyImage[];
    note?: string | undefined;
    requestedAt: Date;
    lateDays: number;
    lateFee: number;
  } | undefined;
  /** Có khi chủ đồ quyết toán, hoặc chỉ có `resolution` khi Admin phán quyết khiếu nại của người thuê */
  settlement?: {
    result?: 'GOOD' | 'DAMAGED' | undefined;
    evidencePhotos?: ToyImage[] | undefined;
    description?: string | undefined;
    settledAt?: Date | undefined;
    autoSettled?: boolean | undefined;
    disputeId?: string | undefined;
    resolution?: RentalRulingSummary | undefined;
  } | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export type RentalStatusGroup =
  | 'all'
  | 'pending'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export const STATUS_GROUP_MAP: Record<RentalStatusGroup, readonly RentalOrderStatus[]> = {
  all: [...rentalOrderStatuses],
  pending: ['PENDING'],
  active: ['ACCEPTED', 'PAID', 'SHIPPING', 'IN_USE', 'RETURNING'],
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED', 'REJECTED', 'EXPIRED'],
  disputed: ['DISPUTING'],
} as const;

export interface RentalToySummaryDto {
  id: string;
  name: string;
  slug: string;
  primaryImage?: string | undefined;
  images?: ToyImage[] | undefined;
  dailyRate: number;
  depositAmount: number;
}

export interface RentalCounterpartDto {
  id: string;
  fullName: string;
  avatar?: string | undefined;
  trustScore?: number | undefined;
  verified: boolean;
  role: 'renter' | 'owner';
}

export interface RentalPartyProfileDto {
  id?: string | undefined;
  fullName: string;
  avatar?: string | undefined;
  trustScore?: number | undefined;
  verified: boolean;
  role?: 'renter' | 'owner' | undefined;
}

export interface RentalTimelineActorDto {
  id: string | null;
  name: string;
  role: string;
  isSystem: boolean;
}

export interface RentalTimelineEntryDto {
  oldStatus?: RentalOrderStatus | null | undefined;
  newStatus: RentalOrderStatus;
  changedBy: RentalTimelineActorDto;
  notes?: string | undefined;
  occurredAt: Date;
}

export type RentalSettlementStatus =
  | 'PENDING_PAYMENT'
  | 'HELD_IN_ESCROW'
  | 'SETTLED'
  | 'REFUNDED'
  | 'DISPUTED'
  | 'CANCELLED';

export type RentalPayoutStatus =
  | 'WAITING_PAYMENT'
  | 'ESCROW_HELD'
  | 'PAID_OUT'
  | 'CANCELLED'
  | 'DISPUTED';

export interface RenterFinancialItemsDto {
  rentalFee: number;
  depositPaid: number;
  lateFee: number;
  depositRefunded: number;
  totalActualCost: number;
}

export interface OwnerFinancialItemsDto {
  grossRentalFee: number;
  platformFeeRate: number;
  platformFee: number;
  lateCompensation: number;
  netEarnings: number;
}

export interface AdminFinancialItemsDto {
  rentalFee: number;
  depositPaid: number;
  lateFee: number;
  depositRefunded: number;
  totalActualCost: number;
  grossRentalFee: number;
  platformFeeRate: number;
  platformFee: number;
  lateCompensation: number;
  netEarnings: number;
  escrowBalance?: number | undefined;
  platformRevenue?: number | undefined;
  renter?: RenterFinancialItemsDto | undefined;
  owner?: OwnerFinancialItemsDto | undefined;
}

export interface FinancialBreakdownSummaryDto {
  status: string;
  description: string;
}

export interface RenterFinancialBreakdownDto {
  role: 'renter';
  currency: string;
  isEstimated: boolean;
  settlementStatus: RentalSettlementStatus;
  items: RenterFinancialItemsDto;
  summary: FinancialBreakdownSummaryDto;
}

export interface OwnerFinancialBreakdownDto {
  role: 'owner';
  currency: string;
  isEstimated: boolean;
  payoutStatus: RentalPayoutStatus;
  items: OwnerFinancialItemsDto;
  summary: FinancialBreakdownSummaryDto;
}

export interface AdminFinancialBreakdownDto {
  role: 'admin';
  currency: string;
  isEstimated: boolean;
  settlementStatus?: RentalSettlementStatus | undefined;
  payoutStatus?: RentalPayoutStatus | undefined;
  items: AdminFinancialItemsDto;
  renter?: RenterFinancialBreakdownDto | undefined;
  owner?: OwnerFinancialBreakdownDto | undefined;
  platformRevenue?: number | undefined;
  summary: FinancialBreakdownSummaryDto;
}

export type RentalFinancialBreakdownDto =
  | RenterFinancialBreakdownDto
  | OwnerFinancialBreakdownDto
  | AdminFinancialBreakdownDto;

export interface RentalOrderItemPricingDto {
  days: number;
  dailyRate: number;
  rentalFee: number;
  depositAmount: number;
  totalPayable: number;
  platformFeeRate?: number | undefined;
  platformFee?: number | undefined;
}

export interface RentalOrderItemDto {
  id: string;
  code: string;
  role: 'renter' | 'owner' | 'admin';
  status: RentalOrderStatus;
  period: DateRange;
  pricing: RentalOrderItemPricingDto;
  toy?: RentalToySummaryDto | undefined;
  counterpart?: RentalCounterpartDto | undefined;
  // Admin xem đơn mình không tham gia thì không có counterpart mà có cả hai bên
  renter?: RentalCounterpartDto | undefined;
  owner?: RentalCounterpartDto | undefined;
  timer?: { kind: RentalTimerKind; dueAt: Date } | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface RentalOrderDetailDto extends Omit<RentalOrderDto, 'pricing'> {
  // Người thuê không nhận platformFee/platformFeeRate
  pricing: RentalOrderItemPricingDto;
  renter?: RentalPartyProfileDto | undefined;
  owner?: RentalPartyProfileDto | undefined;
  toy?: RentalToySummaryDto | undefined;
  timeline?: RentalTimelineEntryDto[] | undefined;
  financialBreakdown?: RentalFinancialBreakdownDto | undefined;
}

export interface RentalHistoryEntryDto {
  oldStatus?: RentalOrderStatus | undefined;
  newStatus: RentalOrderStatus;
  changedBy: string;
  notes?: string | undefined;
  occurredAt: Date;
}

export interface RentalQuoteDto {
  available: boolean;
  pricing: RentalPricing;
  conflicts: DateRange[];
  suggestion?: DateRange | null | undefined;
}

export interface RentalListQuery {
  role?: 'renter' | 'owner' | 'all' | undefined;
  status?: RentalOrderStatus | RentalOrderStatus[] | undefined;
  group?: RentalStatusGroup | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

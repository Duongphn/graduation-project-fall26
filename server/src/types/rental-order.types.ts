import { type DisputeRuling } from '../constants/dispute-ruling.js';
import { type RentalOrderStatus, type RentalTimerKind } from '../constants/rental-order-status.js';
import { type ToyImage } from '../interfaces/toy-listing.ports.js';

export interface RentalSettings {
  ownerResponseHours: number;
  paymentHours: number;
  receiptAutoConfirmHours: number;
  settlementHours: number;
  returnReminderHours: number;
  platformFeeRate: number;
  lateFeeMultiplier: number;
  /** GB-29: điểm tin cậy tối thiểu để thuê đồ có tiền cọc cao */
  minTrustScore: number;
  /** GB-29: tiền cọc (VND) trên mức này mới áp dụng ngưỡng điểm tin cậy */
  trustDepositLimit: number;
  maxDays: number;
  bookingWindowDays: number;
  /** Hạn bên bị khiếu nại phản hồi trước khi Admin quyết định (GB-24) */
  disputeReplyHours: number;
}

export const DEFAULT_RENTAL_SETTINGS: RentalSettings = {
  ownerResponseHours: 24,
  paymentHours: 12,
  receiptAutoConfirmHours: 48,
  settlementHours: 48, // GB-22: the Owner inspects within 48 hours
  returnReminderHours: 24,
  platformFeeRate: 0.1,
  lateFeeMultiplier: 1.0,
  minTrustScore: 50,
  trustDepositLimit: 500_000,
  maxDays: 30,
  bookingWindowDays: 180,
  disputeReplyHours: 72,
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
  settlement?: {
    result: 'GOOD' | 'DAMAGED';
    evidencePhotos?: ToyImage[] | undefined;
    description?: string | undefined;
    settledAt: Date;
    autoSettled?: boolean | undefined;
    disputeId?: string | undefined;
    resolution?: RentalRulingSummary | undefined;
  } | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface RentalOrderDetailDto extends RentalOrderDto {
  renter?: {
    fullName: string;
    avatar?: string | undefined;
    trustScore?: number | undefined;
    verified: boolean;
  } | undefined;
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

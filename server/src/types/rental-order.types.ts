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
  minTrustScore: number;
  maxDays: number;
  bookingWindowDays: number;
}

export const DEFAULT_RENTAL_SETTINGS: RentalSettings = {
  ownerResponseHours: 24,
  paymentHours: 12,
  receiptAutoConfirmHours: 48,
  settlementHours: 72,
  returnReminderHours: 24,
  platformFeeRate: 0.1,
  lateFeeMultiplier: 1.0,
  minTrustScore: 30,
  maxDays: 30,
  bookingWindowDays: 180,
};

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

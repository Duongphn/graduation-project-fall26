export const rentalOrderStatuses = [
  'PENDING',
  'ACCEPTED',
  'PAID',
  'SHIPPING',
  'IN_USE',
  'RETURNING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTING',
] as const;

export type RentalOrderStatus = (typeof rentalOrderStatuses)[number];

export const TERMINAL_RENTAL_STATUSES: readonly RentalOrderStatus[] = [
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
] as const;

export const rentalTimerKinds = [
  'OWNER_RESPONSE',
  'PAYMENT',
  'RECEIPT_CONFIRM',
  'RETURN_REMINDER',
  'OVERDUE',
  'SETTLEMENT',
] as const;

export type RentalTimerKind = (typeof rentalTimerKinds)[number];

export const SYSTEM_ACTOR_ID = '000000000000000000000001';

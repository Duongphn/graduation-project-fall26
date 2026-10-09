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

// The actor/transition matrix remains [NEEDS CONFIRMATION] in R03.
// Do not implement automatic transitions until it is approved.

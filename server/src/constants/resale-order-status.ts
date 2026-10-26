export const resaleOrderStatuses = [
  'PENDING',
  'PAID',
  'SHIPPING',
  'COMPLETED',
  'CANCELLED',
  'DISPUTING',
] as const;

export type ResaleOrderStatus = (typeof resaleOrderStatuses)[number];

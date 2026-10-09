export const resaleOrderStatuses = [
  'PAID',
  'SHIPPING',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTING',
] as const;

export type ResaleOrderStatus = (typeof resaleOrderStatuses)[number];

// SHIPPING is a visible order step only; there is no delivery-provider workflow.

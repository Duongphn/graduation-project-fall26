export const donationStatuses = [
  'PENDING',
  'ACCEPTED',
  'SHIPPING',
  'RECEIVED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  // GB-57, R04 3.9: set by the expiry job (JOB-10) on a pending or accepted request.
  'EXPIRED',
] as const;

export type DonationStatus = (typeof donationStatuses)[number];

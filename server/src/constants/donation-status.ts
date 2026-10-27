export const donationStatuses = [
  'PENDING',
  'ACCEPTED',
  'SHIPPING',
  'RECEIVED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;

export type DonationStatus = (typeof donationStatuses)[number];

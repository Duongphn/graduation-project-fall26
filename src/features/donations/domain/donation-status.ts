export const donationStatuses = [
  'SUBMITTED',
  'ACCEPTED',
  'SHIPPING',
  'CONFIRMED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type DonationStatus = (typeof donationStatuses)[number];

// The direct Charity-account model remains [NEEDS CONFIRMATION].

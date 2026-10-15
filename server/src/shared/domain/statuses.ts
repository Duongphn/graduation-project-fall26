/**
 * Status catalogs shared by the models, services and validation schemas.
 * Values follow R01 V and the business workflows BF-01..BF-05.
 */

export const userRoles = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof userRoles)[number];

export const userStatuses = ['ACTIVE', 'LOCKED'] as const;
export type UserStatus = (typeof userStatuses)[number];

export const identityStatuses = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] as const;
export type IdentityStatus = (typeof identityStatuses)[number];

export const verificationStatuses = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type VerificationStatus = (typeof verificationStatuses)[number];

export const toyStatuses = [
  'PENDING_REVIEW',
  'ACTIVE',
  'REJECTED',
  'RESERVED',
  'SOLD',
  'DONATED',
  'HIDDEN',
] as const;
export type ToyStatus = (typeof toyStatuses)[number];

export const rentalOrderStatuses = [
  'REQUESTED',
  'ACCEPTED',
  'PAID',
  'SHIPPING',
  'IN_USE',
  'RETURNING',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
] as const;
export type RentalOrderStatus = (typeof rentalOrderStatuses)[number];

/** Rental statuses after which the order no longer involves the toy. */
export const finishedRentalOrderStatuses = [
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly RentalOrderStatus[];

/** Rental statuses that hold the toy calendar (checked when the Owner accepts). */
export const calendarBlockingStatuses = [
  'ACCEPTED',
  'PAID',
  'SHIPPING',
  'IN_USE',
  'RETURNING',
  'DISPUTED',
] as const satisfies readonly RentalOrderStatus[];

export const resaleOrderStatuses = [
  'PAID',
  'CONFIRMED',
  'SHIPPING',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
] as const;
export type ResaleOrderStatus = (typeof resaleOrderStatuses)[number];

/** Purchase statuses after which the order no longer involves the toy. */
export const finishedResaleOrderStatuses = [
  'COMPLETED',
  'CANCELLED',
] as const satisfies readonly ResaleOrderStatus[];

/** Purchase statuses that keep a toy sold to a single buyer. */
export const activeResaleStatuses = [
  'PAID',
  'CONFIRMED',
  'SHIPPING',
  'DELIVERED',
  'COMPLETED',
  'DISPUTED',
] as const satisfies readonly ResaleOrderStatus[];

export const donationStatuses = [
  'PENDING',
  'ACCEPTED',
  'SHIPPING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;
export type DonationStatus = (typeof donationStatuses)[number];

/** Donation statuses that give a toy to a single receiver. */
export const activeDonationStatuses = [
  'ACCEPTED',
  'SHIPPING',
  'COMPLETED',
] as const satisfies readonly DonationStatus[];

/** Donation statuses that are still in progress (an organization with one is hidden, not deleted). */
export const openDonationStatuses = [
  'PENDING',
  'ACCEPTED',
  'SHIPPING',
] as const satisfies readonly DonationStatus[];

export const disputeStatuses = ['OPEN', 'UNDER_REVIEW', 'RESOLVED'] as const;
export type DisputeStatus = (typeof disputeStatuses)[number];

export const openDisputeStatuses = [
  'OPEN',
  'UNDER_REVIEW',
] as const satisfies readonly DisputeStatus[];

export const paymentStatuses = ['PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED'] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const withdrawalStatuses = ['PENDING', 'COMPLETED', 'REJECTED'] as const;
export type WithdrawalStatus = (typeof withdrawalStatuses)[number];

export const reportStatuses = ['PENDING', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof reportStatuses)[number];

export const walletStatuses = ['ACTIVE', 'FROZEN'] as const;
export type WalletStatus = (typeof walletStatuses)[number];

export const visibilityStatuses = ['ACTIVE', 'HIDDEN'] as const;
export type VisibilityStatus = (typeof visibilityStatuses)[number];

export const voucherStatuses = ['ACTIVE', 'DISABLED'] as const;
export type VoucherStatus = (typeof voucherStatuses)[number];

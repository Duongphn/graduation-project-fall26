// Value lists mirrored from the backend (server/src/shared/domain/{statuses,enums}.ts).
// This is the ONLY frontend copy: features import from here, never redeclare a list.

export const userRoles = ['USER', 'ADMIN'] as const
export type UserRole = (typeof userRoles)[number]

export const userStatuses = ['ACTIVE', 'LOCKED'] as const
export type UserStatus = (typeof userStatuses)[number]

export const identityStatuses = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] as const
export type IdentityStatus = (typeof identityStatuses)[number]

export const verificationStatuses = ['PENDING', 'VERIFIED', 'REJECTED'] as const
export type VerificationStatus = (typeof verificationStatuses)[number]

export const toyStatuses = [
  'PENDING_REVIEW',
  'ACTIVE',
  'REJECTED',
  'RESERVED',
  'SOLD',
  'DONATED',
  'HIDDEN',
] as const
export type ToyStatus = (typeof toyStatuses)[number]

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
] as const
export type RentalOrderStatus = (typeof rentalOrderStatuses)[number]

export const resaleOrderStatuses = [
  'PAID',
  'CONFIRMED',
  'SHIPPING',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
] as const
export type ResaleOrderStatus = (typeof resaleOrderStatuses)[number]

export const donationStatuses = [
  'PENDING',
  'ACCEPTED',
  'SHIPPING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const
export type DonationStatus = (typeof donationStatuses)[number]

export const disputeStatuses = ['OPEN', 'UNDER_REVIEW', 'RESOLVED'] as const
export type DisputeStatus = (typeof disputeStatuses)[number]

export const paymentStatuses = ['PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED'] as const
export type PaymentStatus = (typeof paymentStatuses)[number]

export const withdrawalStatuses = ['PENDING', 'COMPLETED', 'REJECTED'] as const
export type WithdrawalStatus = (typeof withdrawalStatuses)[number]

export const reportStatuses = ['PENDING', 'RESOLVED', 'DISMISSED'] as const
export type ReportStatus = (typeof reportStatuses)[number]

// Categories and organizations.
export const visibilityStatuses = ['ACTIVE', 'HIDDEN'] as const
export type VisibilityStatus = (typeof visibilityStatuses)[number]

export const listingTypes = ['RENT', 'SALE', 'DONATION'] as const
export type ListingType = (typeof listingTypes)[number]

export const toyConditions = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] as const
export type ToyCondition = (typeof toyConditions)[number]

export const ageGroups = ['AGE_0_2', 'AGE_3_5', 'AGE_6_8', 'AGE_9_12', 'AGE_13_PLUS'] as const
export type AgeGroup = (typeof ageGroups)[number]

export const donationReceiverTypes = ['USER', 'ORGANIZATION'] as const
export type DonationReceiverType = (typeof donationReceiverTypes)[number]

// Who changed an order or donation status (order_status_history.actorType).
export const actorTypes = ['USER', 'ADMIN', 'SYSTEM'] as const
export type ActorType = (typeof actorTypes)[number]

// Photo steps of a donation handover (donation_requests.schemas.ts).
export const handoverSteps = ['DONOR_SENT', 'RECEIVER_RECEIVED'] as const
export type HandoverStep = (typeof handoverSteps)[number]

// GB-07 minimum user age. The backend reads USER_MIN_AGE_YEARS and sends it as `minAgeYears`
// where a screen needs it (toy moderation); this copy is only the fallback when it does not.
export const USER_MIN_AGE_YEARS = 18

export const notificationTypes = [
  'IDENTITY_REVIEWED',
  'TOY_REVIEWED',
  'RENTAL_STATUS_CHANGED',
  'RESALE_STATUS_CHANGED',
  'DONATION_STATUS_CHANGED',
  'DISPUTE_UPDATED',
  'PAYMENT_RESULT',
  'WITHDRAWAL_PROCESSED',
  'NEW_MESSAGE',
  'REVIEW_RECEIVED',
  'ACCOUNT_LOCKED',
  'TRUST_REVIEW',
] as const
export type NotificationType = (typeof notificationTypes)[number]

// POST /uploads/signature purposes (server/src/features/uploads/uploads.schemas.ts).
export const uploadPurposes = [
  'TOY_PHOTO',
  'AVATAR',
  'ORGANIZATION_LOGO',
  'IDENTITY_DOCUMENT',
  'HANDOVER_PHOTO',
  'DISPUTE_EVIDENCE',
] as const
export type UploadPurpose = (typeof uploadPurposes)[number]

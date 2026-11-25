// Value lists of the backend as stored by develop's models (server/src/features/*/*.model.ts).
// This is the ONLY frontend copy of these lists for the admin and donation features.

export const userRoles = ['USER', 'ADMIN'] as const
export type UserRole = (typeof userRoles)[number]

export const userStatuses = ['ACTIVE', 'LOCKED'] as const
export type UserStatus = (typeof userStatuses)[number]

// users.verificationStatus
export const identityStatuses = ['unverified', 'pending', 'verified', 'rejected'] as const
export type IdentityStatus = (typeof identityStatuses)[number]

// identity_verifications.status
export const verificationStatuses = ['pending', 'verified', 'rejected'] as const
export type VerificationStatus = (typeof verificationStatuses)[number]

// toys.status (a rejected post is 'hidden' with moderation.rejectReason)
export const toyStatuses = ['pending', 'active', 'hidden'] as const
export type ToyStatus = (typeof toyStatuses)[number]

// donation_requests.status ('received' exists in the model but is not used by the flow)
export const donationStatuses = [
  'pending',
  'accepted',
  'shipping',
  'received',
  'completed',
  'rejected',
  'cancelled',
  // GB-57: set by the expiry job (JOB-10) on a pending or accepted request
  'expired',
] as const
export type DonationStatus = (typeof donationStatuses)[number]

// disputes.status (server models/dispute.model.ts)
export const disputeStatuses = ['open', 'under_review', 'resolved', 'closed'] as const
export type DisputeStatus = (typeof disputeStatuses)[number]

// Categories and organizations.
export const visibilityStatuses = ['active', 'hidden'] as const
export type VisibilityStatus = (typeof visibilityStatuses)[number]

// toys.listingType ('donate': free donation posts)
export const listingTypes = ['rent', 'sell', 'donate'] as const
export type ListingType = (typeof listingTypes)[number]

export const donationReceiverTypes = ['USER', 'ORGANIZATION'] as const
export type DonationReceiverType = (typeof donationReceiverTypes)[number]

// Who changed a donation status.
export const actorTypes = ['USER', 'ADMIN', 'SYSTEM'] as const
export type ActorType = (typeof actorTypes)[number]

// Photo steps of a donation handover (donation_requests.handovers.step).
export const handoverSteps = ['DONOR_SENT', 'RECEIVER_RECEIVED'] as const
export type HandoverStep = (typeof handoverSteps)[number]

// notifications.type (server constants/notification-types.ts).
export const notificationTypes = [
  'RENTAL_ORDER',
  'PURCHASE_ORDER',
  'PAYMENT',
  'WALLET',
  'DISPUTE',
  'TOY_REVIEWED',
  'IDENTITY_REVIEWED',
  'DONATION_STATUS_CHANGED',
  'ACCOUNT',
  'VIOLATION_REPORT',
  'CHAT_MESSAGE',
  'VOUCHER',
  'REVIEW',
  'REMINDER',
  'SYSTEM',
] as const
export type NotificationType = (typeof notificationTypes)[number]

// POST /uploads/signature purposes (server/src/features/uploads/uploads.schemas.ts).
export const uploadPurposes = [
  'TOY_PHOTO',
  'AVATAR',
  'IDENTITY_DOCUMENT',
  'HANDOVER_PHOTO',
  'DISPUTE_EVIDENCE',
  'CHAT_IMAGE',
] as const
export type UploadPurpose = (typeof uploadPurposes)[number]

/** Value catalogs (other than statuses) shared by the models and validation schemas. */

export const listingTypes = ['RENT', 'SALE', 'DONATION'] as const;
export type ListingType = (typeof listingTypes)[number];

export const toyConditions = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] as const;
export type ToyCondition = (typeof toyConditions)[number];

export const ageGroups = ['AGE_0_2', 'AGE_3_5', 'AGE_6_8', 'AGE_9_12', 'AGE_13_PLUS'] as const;
export type AgeGroup = (typeof ageGroups)[number];

// GOOGLE_SIGN_UP: email OTP before an account is created from a Google profile.
// GOOGLE_LOGIN_EXCHANGE: one-time code exchanged for a session after the Google redirect.
export const otpPurposes = [
  'SIGN_UP',
  'RESET_PASSWORD',
  'CHANGE_PHONE',
  'GOOGLE_SIGN_UP',
  'GOOGLE_LOGIN_EXCHANGE',
] as const;
export type OtpPurpose = (typeof otpPurposes)[number];

export const paymentGateways = ['VNPAY', 'MOMO'] as const;
export type PaymentGateway = (typeof paymentGateways)[number];

export const walletOwnerTypes = ['USER', 'PLATFORM'] as const;
export type WalletOwnerType = (typeof walletOwnerTypes)[number];

export const ledgerBuckets = ['AVAILABLE', 'HELD'] as const;
export type LedgerBucket = (typeof ledgerBuckets)[number];

export const ledgerEntryTypes = [
  'TOP_UP',
  'ORDER_PAYMENT',
  'ORDER_SETTLEMENT',
  'ORDER_REFUND',
  'PLATFORM_FEE',
  'DISPUTE_SETTLEMENT',
  'WITHDRAWAL_HOLD',
  'WITHDRAWAL_RELEASE',
  'WITHDRAWAL_PAYOUT',
] as const;
export type LedgerEntryType = (typeof ledgerEntryTypes)[number];

/** Kinds of documents that a `{ kind, id }` reference can point to. */
export const referenceKinds = [
  'USER',
  'CATEGORY',
  'ORGANIZATION',
  'TOY',
  'RENTAL_ORDER',
  'PURCHASE_ORDER',
  'DONATION_REQUEST',
  'DISPUTE',
  'PAYMENT',
  'WITHDRAWAL_REQUEST',
  'IDENTITY_VERIFICATION',
  'VIOLATION_REPORT',
  'MESSAGE',
  'REVIEW',
] as const;
export type ReferenceKind = (typeof referenceKinds)[number];

export const reportTargetKinds = [
  'USER',
  'TOY',
  'MESSAGE',
  'REVIEW',
] as const satisfies readonly ReferenceKind[];

export const reportActions = ['NONE', 'WARNING', 'HIDE_CONTENT', 'LOCK_USER'] as const;
export type ReportAction = (typeof reportActions)[number];

/** What happens when an order timer fires. One active timer per order. */
export const timerActions = [
  'OWNER_RESPONSE',
  'PAYMENT',
  'RECEIPT_CONFIRMATION',
  'RETURN_INSPECTION',
  'SELLER_CONFIRMATION',
  'BUYER_CONFIRMATION',
] as const;
export type TimerAction = (typeof timerActions)[number];

export const handoverSteps = [
  'OWNER_SENT',
  'RENTER_RECEIVED',
  'RENTER_RETURNED',
  'OWNER_RECEIVED',
  'SELLER_SENT',
  'BUYER_RECEIVED',
  'DONOR_SENT',
  'RECEIVER_RECEIVED',
] as const;
export type HandoverStep = (typeof handoverSteps)[number];

export const cancellationReasons = [
  'OWNER_REJECTED',
  'OWNER_NO_RESPONSE',
  'PAYMENT_TIMEOUT',
  'CALENDAR_TAKEN',
  'SELLER_NO_CONFIRMATION',
  'CANCELLED_BY_USER',
  'CANCELLED_BY_ADMIN',
] as const;
export type CancellationReason = (typeof cancellationReasons)[number];

export const donationReceiverTypes = ['USER', 'ORGANIZATION'] as const;
export type DonationReceiverType = (typeof donationReceiverTypes)[number];

export const discountTypes = ['PERCENT', 'FIXED'] as const;
export type DiscountType = (typeof discountTypes)[number];

export const aiRequestKinds = ['ADVISOR', 'DAMAGE_CHECK'] as const;
export type AiRequestKind = (typeof aiRequestKinds)[number];

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
] as const;
export type NotificationType = (typeof notificationTypes)[number];

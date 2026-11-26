// Values of notifications.type (UC26). One type per kind of event; the title and body say what
// happened. Every module emits through the shared notify() (utils/notify.ts) with one of these.
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
] as const;
export type NotificationType = (typeof notificationTypes)[number];

export interface NotificationTypeRule {
  /** Important events also send a copy by email (R03 API-01: account locks, dispute rulings…). */
  email: boolean;
  /**
   * The user may turn this type off. Money, account security, deadlines and decisions that need
   * an action are always delivered.
   */
  mutable: boolean;
}

export const notificationTypeRules: Record<NotificationType, NotificationTypeRule> = {
  RENTAL_ORDER: { email: false, mutable: false },
  PURCHASE_ORDER: { email: false, mutable: false },
  PAYMENT: { email: false, mutable: false },
  WALLET: { email: true, mutable: false },
  DISPUTE: { email: true, mutable: false },
  TOY_REVIEWED: { email: true, mutable: false },
  IDENTITY_REVIEWED: { email: true, mutable: false },
  // GB-61: the Donor is told in the app and by email.
  DONATION_STATUS_CHANGED: { email: true, mutable: false },
  ACCOUNT: { email: true, mutable: false },
  VIOLATION_REPORT: { email: false, mutable: false },
  // The Inbox has its own unread count.
  CHAT_MESSAGE: { email: false, mutable: true },
  VOUCHER: { email: false, mutable: true },
  REVIEW: { email: false, mutable: true },
  REMINDER: { email: false, mutable: true },
  SYSTEM: { email: true, mutable: false },
};

export const mutableNotificationTypes = notificationTypes.filter(
  (type) => notificationTypeRules[type].mutable,
);

// Types written before this list existed (develop's identity events) and still in the 30-day feed.
const legacyTypes: Record<string, NotificationType> = {
  IDENTITY_VERIFICATION: 'IDENTITY_REVIEWED',
};

export const toNotificationType = (stored: string): NotificationType =>
  (notificationTypes as readonly string[]).includes(stored)
    ? (stored as NotificationType)
    : (legacyTypes[stored] ?? 'SYSTEM');

// Values of notifications.type written by this feature (develop's model stores a free string).
export const notificationTypes = [
  'IDENTITY_REVIEWED',
  'TOY_REVIEWED',
  'DONATION_STATUS_CHANGED',
] as const;
export type NotificationType = (typeof notificationTypes)[number];

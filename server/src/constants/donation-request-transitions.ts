import { donationStatuses } from './donation-status.js';
import type { StoredDonationStatus } from '../models/donation-request.model.js';
import type { TransitionMap } from '../utils/transitions.js';

/** Develop's donation statuses (domain/donation-status.ts) as stored by the model: lowercase. */
export const storedDonationStatuses = donationStatuses.map(
  (status) => status.toLowerCase() as StoredDonationStatus,
) as readonly StoredDonationStatus[] as readonly [StoredDonationStatus, ...StoredDonationStatus[]];

/**
 * BF-04. The receiver's confirmation completes the request directly ('received' is not used by
 * this flow). shipping -> cancelled is the Admin's way out of a stuck handover. pending and
 * accepted -> expired is the expiry job only (JOB-10, GB-57; R03 I.3.2 Donation Request).
 */
export const donationTransitions: TransitionMap<StoredDonationStatus> = {
  pending: ['accepted', 'rejected', 'cancelled', 'expired'],
  accepted: ['shipping', 'cancelled', 'expired'],
  shipping: ['completed', 'cancelled'],
  received: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
  expired: [],
};

/**
 * GB-57 time limits, in days. System Settings (UC30) under these keys override the defaults:
 * a Pending request expires after decisionDays, an Accepted one after handoverDays, and a
 * Shipping one is flagged as overdue for the Admin after confirmDays (never confirmed).
 */
export interface DonationSettings {
  decisionDays: number;
  handoverDays: number;
  confirmDays: number;
}

export const DONATION_SETTING_KEYS: Record<keyof DonationSettings, string> = {
  decisionDays: 'DONATION_DECISION_DAYS',
  handoverDays: 'DONATION_HANDOVER_DAYS',
  confirmDays: 'DONATION_CONFIRM_DAYS',
};

export const DEFAULT_DONATION_SETTINGS: DonationSettings = {
  decisionDays: 14,
  handoverDays: 14,
  confirmDays: 14,
};

export const DELIVERY_METHOD = 'shipping';

/** GB-58: how the Donor hands the toy over (R04 3.9 handover_method). Stored lowercase. */
export const handoverMethods = ['drop_off', 'carrier'] as const;
export type HandoverMethod = (typeof handoverMethods)[number];

/** GB-59: how an organization confirmed receipt to the Admin (R03 III.7.5.2 (8)). */
export const receiptChannels = ['phone', 'email', 'in_person'] as const;
export type ReceiptChannel = (typeof receiptChannels)[number];

/** R03 III.5.2.1 (8): the note of a Donor's request to an organization. */
export const DONOR_REQUEST_NOTE_MAX = 300;

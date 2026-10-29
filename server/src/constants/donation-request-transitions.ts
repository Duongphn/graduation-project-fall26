import { donationStatuses } from './donation-status.js';
import type { StoredDonationStatus } from '../models/donation-request.model.js';
import type { TransitionMap } from '../utils/transitions.js';

/** Develop's donation statuses (domain/donation-status.ts) as stored by the model: lowercase. */
export const storedDonationStatuses = donationStatuses.map(
  (status) => status.toLowerCase() as StoredDonationStatus,
) as readonly StoredDonationStatus[] as readonly [StoredDonationStatus, ...StoredDonationStatus[]];

/**
 * BF-04. The receiver's confirmation completes the request directly ('received' is not used by
 * this flow). shipping -> cancelled is the Admin's way out of a stuck handover.
 */
export const donationTransitions: TransitionMap<StoredDonationStatus> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['shipping', 'cancelled'],
  shipping: ['completed', 'cancelled'],
  received: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
};

/** Days before a request in this status expires (the expiry job cancels it). */
export const PENDING_EXPIRY_DAYS = 14;
export const HANDOVER_EXPIRY_DAYS = 14;

export const DELIVERY_METHOD = 'shipping';

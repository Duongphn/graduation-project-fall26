import type { TransitionMap } from '../utils/transitions.js';

/** Stored visibility of an organization (develop's model: 'active' by default). */
export const organizationStatuses = ['active', 'hidden'] as const;
export type OrganizationStatus = (typeof organizationStatuses)[number];

/** active (Donors can choose it) <-> hidden. Created as active: the Admin has checked it. */
export const organizationTransitions: TransitionMap<OrganizationStatus> = {
  active: ['hidden'],
  hidden: ['active'],
};

/** Donation request statuses still in progress (stored lowercase by develop's model). */
export const openDonationStatuses = ['pending', 'accepted', 'shipping'] as const;

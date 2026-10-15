import { conflict } from '../errors/app-error.js';
import type {
  DisputeStatus,
  DonationStatus,
  RentalOrderStatus,
  ResaleOrderStatus,
  ToyStatus,
} from './statuses.js';

type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

/** BF-02. Owner rejections and timeouts end as CANCELLED with a cancellation reason. */
export const rentalOrderTransitions: TransitionMap<RentalOrderStatus> = {
  REQUESTED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PAID', 'CANCELLED'],
  PAID: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['IN_USE', 'DISPUTED'],
  IN_USE: ['RETURNING', 'DISPUTED'],
  RETURNING: ['COMPLETED', 'DISPUTED'],
  DISPUTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** BF-03. */
export const resaleOrderTransitions: TransitionMap<ResaleOrderStatus> = {
  PAID: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED'],
  DELIVERED: ['COMPLETED', 'DISPUTED'],
  DISPUTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * BF-04. SHIPPING -> CANCELLED is the Admin's way out of a stuck handover (the toy never
 * arrived): only an Admin may take it, with a reason (donation_requests.policy.ts).
 */
export const donationTransitions: TransitionMap<DonationStatus> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** BF-05. */
export const disputeTransitions: TransitionMap<DisputeStatus> = {
  OPEN: ['UNDER_REVIEW', 'RESOLVED'],
  UNDER_REVIEW: ['RESOLVED'],
  RESOLVED: [],
};

/** FE-03 moderation plus the effect of orders and donations on a post. */
export const toyTransitions: TransitionMap<ToyStatus> = {
  PENDING_REVIEW: ['ACTIVE', 'REJECTED'],
  REJECTED: ['PENDING_REVIEW'],
  ACTIVE: ['RESERVED', 'HIDDEN', 'PENDING_REVIEW'],
  RESERVED: ['ACTIVE', 'SOLD', 'DONATED'],
  HIDDEN: ['ACTIVE', 'PENDING_REVIEW'],
  SOLD: [],
  DONATED: [],
};

export const canTransition = <S extends string>(map: TransitionMap<S>, from: S, to: S): boolean =>
  map[from].includes(to);

export const assertTransition = <S extends string>(map: TransitionMap<S>, from: S, to: S): void => {
  if (!canTransition(map, from, to)) {
    // A 409 for the client instead of an unhandled 500.
    throw conflict('INVALID_STATUS_TRANSITION', `Status cannot change from ${from} to ${to}.`, {
      from,
      to,
    });
  }
};
